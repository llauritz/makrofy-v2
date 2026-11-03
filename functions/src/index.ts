import { initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { defineSecret } from "firebase-functions/params"
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https"
import { onSchedule } from "firebase-functions/v2/scheduler"
import { logger } from "firebase-functions/v2"

import {
  admitAiCall,
  describeGeminiError,
  parseRequest,
  recordAiCost,
  runGemini,
  type AiFillResponse,
} from "./ai-fill.js"
import {
  classifyAiFailure,
  sanitizeReport,
  type AiFailureReport,
} from "./ai-failure.js"
import { ALERT_MESSAGE, runAiHealthCheck } from "./ai-health.js"
import { isEntitling, type PaddleSubscription } from "./entitlement.js"
import {
  changeSubscriptionPrice,
  createPortalLink,
  previewSubscriptionPrice,
} from "./paddle-api.js"
import { PADDLE, type Billing, type PaidPlan } from "./paddle-config.js"
import { verifyPaddleSignature } from "./signature.js"
import {
  applyPaddleEvent,
  applySubscription,
  entitlementRef,
  fromDoc,
  type PaddleEvent,
} from "./webhook.js"

// Yaffle's server side (ADR 0012): Paddle's webhook writes each user's
// entitlement doc, and two callables hand the app what needs the API key — a
// customer-portal link and a plan change. Every AI fill runs through the
// aiFill callable, which enforces the plan's allowance (ADR 0016). AI fill
// failures are reported and checked every 15 minutes (ADR 0014;
// docs/runbooks/ai-fill-errors.md). Secrets come from Google Secret
// Manager (`firebase functions:secrets:set <NAME>`); see docs/runbooks/paddle.md.

initializeApp()
const db = getFirestore()

const PADDLE_WEBHOOK_SECRET = defineSecret("PADDLE_WEBHOOK_SECRET")
const PADDLE_API_KEY = defineSecret("PADDLE_API_KEY")

const REGION = "us-central1"

/**
 * An error as log fields. An Error's message and stack aren't enumerable, so
 * logging the object itself came out as {} — a failure with no reason.
 */
function errorFields(err: unknown): { error: string; stack?: string } {
  return err instanceof Error
    ? { error: err.message, stack: err.stack }
    : { error: String(err) }
}

/**
 * Paddle notification destination:
 * https://us-central1-goyaffle.cloudfunctions.net/paddleWebhook
 * 200 tells Paddle the event is handled (or deliberately ignored); anything
 * else makes it retry, which is what we want for a transient failure or a
 * config error fixed by a redeploy.
 */
export const paddleWebhook = onRequest(
  { region: REGION, secrets: [PADDLE_WEBHOOK_SECRET], maxInstances: 5 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("POST only")
      return
    }
    const ok = verifyPaddleSignature(
      req.get("Paddle-Signature"),
      req.rawBody,
      PADDLE_WEBHOOK_SECRET.value()
    )
    if (!ok) {
      logger.warn("Paddle webhook: bad signature")
      res.status(401).send("Bad signature")
      return
    }
    const event = req.body as PaddleEvent
    try {
      const outcome = await applyPaddleEvent(db, event)
      if (outcome === "no-uid") {
        // Nothing to retry: the checkout didn't carry a uid. Log loudly so
        // the subscription can be matched up by hand.
        logger.error("Paddle webhook: subscription without a uid", {
          eventId: event.event_id,
          type: event.event_type,
        })
      } else {
        logger.info("Paddle webhook", {
          eventId: event.event_id,
          type: event.event_type,
          outcome,
        })
      }
      res.status(200).send(outcome)
    } catch (err) {
      logger.error("Paddle webhook failed", {
        eventId: event.event_id,
        type: event.event_type,
        ...errorFields(err),
      })
      res.status(500).send("Failed")
    }
  }
)

/** Signed-in, non-guest caller's uid, or a refusal. */
function memberUid(
  auth:
    | { uid: string; token: { firebase?: { sign_in_provider?: string } } }
    | undefined
): string {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.")
  if (auth.token.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("permission-denied", "Sign in with Google first.")
  }
  return auth.uid
}

/** A link into Paddle's customer portal for the caller's subscription. */
export const paddlePortal = onCall(
  { region: REGION, secrets: [PADDLE_API_KEY] },
  async (req) => {
    const uid = memberUid(req.auth)
    const entitlement = fromDoc((await entitlementRef(db, uid).get()).data())
    if (!entitlement?.customerId) {
      throw new HttpsError("failed-precondition", "No subscription.")
    }
    try {
      const url = await createPortalLink(
        PADDLE_API_KEY.value(),
        entitlement.customerId,
        entitlement.subscriptionId || null
      )
      return { url }
    } catch (err) {
      logger.error("Paddle portal failed", { uid, ...errorFields(err) })
      throw new HttpsError("unavailable", "Paddle didn't answer.")
    }
  }
)

/** The price a plan-change request names, or a refusal. */
function requestedPrice(data: unknown): { plan: PaidPlan; priceId: string } {
  const { plan, billing } = (data ?? {}) as {
    plan?: PaidPlan
    billing?: Billing
  }
  const priceId = plan && billing ? PADDLE.prices[plan]?.[billing] : undefined
  if (!plan || !priceId)
    throw new HttpsError("invalid-argument", "Unknown plan.")
  return { plan, priceId }
}

/** The caller's running subscription, or a refusal. */
async function runningSubscription(uid: string) {
  const entitlement = fromDoc((await entitlementRef(db, uid).get()).data())
  if (!entitlement || !isEntitling(entitlement.status)) {
    throw new HttpsError("failed-precondition", "No running subscription.")
  }
  return entitlement
}

/**
 * What moving the caller's subscription to another plan or billing period
 * would charge or credit now — shown on the plans sheet before they confirm.
 */
export const paddlePreviewChange = onCall(
  { region: REGION, secrets: [PADDLE_API_KEY] },
  async (req) => {
    const uid = memberUid(req.auth)
    const { priceId } = requestedPrice(req.data)
    const entitlement = await runningSubscription(uid)
    try {
      return await previewSubscriptionPrice(
        PADDLE_API_KEY.value(),
        entitlement.subscriptionId,
        priceId
      )
    } catch (err) {
      logger.error("Paddle change preview failed", { uid, ...errorFields(err) })
      throw new HttpsError("unavailable", "Paddle didn't answer.")
    }
  }
)

/**
 * Move the caller's running subscription to another plan or billing period.
 * A new checkout would open a second subscription, so a paying user changes
 * plan here instead. Paddle's reply is applied at once; the webhook's echo of
 * the same change is then a no-op.
 */
export const paddleChangePlan = onCall(
  { region: REGION, secrets: [PADDLE_API_KEY] },
  async (req) => {
    const uid = memberUid(req.auth)
    const { plan, priceId } = requestedPrice(req.data)
    const entitlement = await runningSubscription(uid)
    let sub: PaddleSubscription
    try {
      sub = await changeSubscriptionPrice<PaddleSubscription>(
        PADDLE_API_KEY.value(),
        entitlement.subscriptionId,
        priceId
      )
    } catch (err) {
      logger.error("Paddle plan change failed", { uid, ...errorFields(err) })
      throw new HttpsError("unavailable", "Paddle didn't answer.")
    }
    await applySubscription(
      db,
      uid,
      sub,
      new Date(sub.updated_at ?? Date.now())
    )
    return { plan }
  }
)

/**
 * The phone reports one failed AI fill (ADR 0014). Classified here, not on
 * the phone, so a new rule applies without an app update. Any signed-in
 * identity may report, Guests included; App Check is not enforced, because
 * App Check failing is one of the things being reported.
 */
export const reportAiFailure = onCall(
  { region: REGION, maxInstances: 3 },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.")
    return storeAiFailure(req.auth.uid, sanitizeReport(req.data))
  }
)

/** Classify one failed AI fill and keep it for the health check. */
async function storeAiFailure(uid: string, report: AiFailureReport) {
  const { blame, kind } = classifyAiFailure(report)
  const at = Timestamp.now()
  await db.collection("aiFailures").add({
    ...report,
    uid,
    blame,
    kind,
    at,
    // Firestore's TTL policy on expireAt deletes reports after 90 days.
    expireAt: Timestamp.fromMillis(at.toMillis() + 90 * 86_400_000),
  })
  const log = blame === "ours" ? logger.error : logger.warn
  log("AI fill failed", { blame, kind, uid, ...report })
  return { blame, kind }
}

// Account creation times never change, so one lookup per user per instance.
const createdCache = new Map<string, Date>()

async function accountCreated(uid: string): Promise<Date> {
  const cached = createdCache.get(uid)
  if (cached) return cached
  const created = new Date((await getAuth().getUser(uid)).metadata.creationTime)
  createdCache.set(uid, created)
  return created
}

/**
 * One AI fill round trip (ADR 0016): admit it against the plan's allowance,
 * ask Gemini, count what it cost. Guests count like anyone else. Only the app
 * itself can call it (App Check); together with the allowance and its burst
 * brake this replaces the advisory counter on the phone.
 *
 * `{ warm: true }` does nothing but start an instance. The app sends it when
 * it opens, so the first fill of a session doesn't wait on a cold start
 * without paying for an instance kept running all month. It needs no App
 * Check, so the reCAPTCHA script still loads only on the first ✨ tap; the
 * check is therefore made here rather than with enforceAppCheck.
 *
 * A refusal is `resource-exhausted` with the reason, plan, limit and reset
 * date in `details`; a Gemini failure is `unavailable`, already reported to
 * /aiFailures (`details.reported`), so the phone doesn't report it twice.
 */
export const aiFill = onCall(
  {
    region: REGION,
    // Each instance serves many fills at once (they mostly wait on Gemini).
    maxInstances: 10,
    concurrency: 40,
    cpu: 1,
    memory: "512MiB",
    timeoutSeconds: 75,
  },
  async (req): Promise<AiFillResponse | { warm: true }> => {
    const warm = (req.data as { warm?: unknown } | null)?.warm === true
    if (warm) return { warm: true }
    // Set only when the request carried a valid App Check token.
    if (!req.app) throw new HttpsError("unauthenticated", "App Check failed.")
    if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.")
    const uid = req.auth.uid
    const request = parseRequest(req.data)
    if (!request) throw new HttpsError("invalid-argument", "Bad prompt.")
    const now = new Date()
    const admission = await admitAiCall(db, uid, {
      final: request.final,
      now,
      accountCreated: () => accountCreated(uid),
    })
    if (!admission.ok) {
      logger.info("AI fill refused", {
        uid,
        refusal: admission.refusal,
        plan: admission.plan,
      })
      throw new HttpsError("resource-exhausted", admission.refusal, {
        reason: admission.refusal,
        plan: admission.plan,
        limit: admission.limit,
        resetsOn: admission.resetsOn.toISOString(),
      })
    }

    const started = Date.now()
    let reply: Awaited<ReturnType<typeof runGemini>>
    try {
      reply = await runGemini(request.prompt)
    } catch (err) {
      const report = describeGeminiError(err, {
        ms: Date.now() - started,
        final: request.final,
      })
      await storeAiFailure(uid, report).catch((e: unknown) =>
        logger.error("AI failure report not stored", errorFields(e))
      )
      throw new HttpsError("unavailable", "The AI service failed.", {
        reason: "upstream",
        reported: true,
        status: report.status,
      })
    }
    const { queries, steps, searchTimedOut, ...answer } = reply
    logger.info("AI fill", {
      uid,
      plan: admission.plan,
      final: request.final,
      steps,
      queries,
      searchTimedOut,
      ms: Date.now() - started,
    })
    await recordAiCost(db, admission.cycleRef, {
      final: request.final,
      queries,
      steps,
      searchTimedOut,
      now,
    }).catch((e: unknown) =>
      logger.error("AI fill cost not recorded", errorFields(e))
    )
    return answer
  }
)

/**
 * Every quarter hour: sum up the window that just ended. An alert is logged
 * at error level as ALERT_MESSAGE; the Cloud Monitoring policy in the runbook
 * turns it into an email.
 */
export const aiFillHealth = onSchedule(
  {
    region: REGION,
    schedule: "every 15 minutes",
    timeZone: "UTC",
    maxInstances: 1,
    retryCount: 0,
  },
  async (event) => {
    const summary = await runAiHealthCheck(db, new Date(event.scheduleTime))
    if (!summary) return
    const fields = {
      verdict: summary.verdict,
      alerts: summary.alerts,
      window: summary.start.toISOString(),
      failures: summary.failures,
      byKind: summary.byKind,
      usersByBlame: summary.usersByBlame,
      googleIncidents: summary.googleIncidents,
      payingUsers: summary.payingUids.length,
    }
    if (summary.verdict === "quiet") logger.info("AI fill health", fields)
    else logger.error(ALERT_MESSAGE, fields)
  }
)

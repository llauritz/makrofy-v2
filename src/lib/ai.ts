import type { AiFailureReport } from "../../functions/src/ai-failure"
import type { Refusal } from "../../functions/src/ai-allowance"
import type { AiFillRequest, AiFillResponse } from "../../functions/src/ai-fill"
import { describeAiError, describeBadOutput } from "./ai-report"
import { app } from "./firebase"
import { callable } from "./functions"
import { parseMacroFillResponse, type MacroFillResult } from "./macro-fill"

// The phone's side of AI macro-fill (spec § AI macro-fill, #21). Gemini runs
// in the aiFill Cloud Function (ADR 0016), which checks the plan's allowance,
// counts the trip and calls the model; the phone sends the text and validates
// the answer against the four-tier contract. The function requires App Check,
// whose reCAPTCHA script loads on the first ✨ tap — most sessions never pay
// for it.

/** Shown in failure reports; the function's own constant is MODEL_ID. */
const MODEL_LABEL = "aiFill"

// The reCAPTCHA Enterprise site key for production App Check attestation —
// public by design (it ships in the bundle, like firebaseConfig). Local dev
// doesn't use it: the `local-dev` debug token in .env.local takes over below.
const RECAPTCHA_ENTERPRISE_SITE_KEY = "6LcoOE4tAAAAAOWYJ_eLVGQjIRCqlgP0dHeM9az-"

/** One model answer: the validated four-tier result plus its display duty. */
export interface AiFillReply {
  result: MacroFillResult
  /**
   * Google Search Suggestions HTML (groundingMetadata.searchEntryPoint) —
   * present exactly when the model searched, and REQUIRED to be displayed at
   * response time then (Google's grounding terms — compliance, not style).
   * Null on ungrounded answers: staples resolve silently.
   */
  attribution: string | null
}

/** The server refused the trip: the allowance is used up, or a brake held. */
export class AiRefusedError extends Error {
  readonly refusal: Refusal
  constructor(refusal: Refusal) {
    super(`AI fill refused: ${refusal}`)
    this.name = "AiRefusedError"
    this.refusal = refusal
  }
}

let appCheckPromise: Promise<void> | null = null

/** App Check, initialised once per page before the first AI call. */
export function ensureAppCheck(): Promise<void> {
  appCheckPromise ??= initAppCheck()
  return appCheckPromise
}

async function initAppCheck() {
  const appCheck = await import("firebase/app-check")
  // In dev the registered `local-dev` debug token (git-ignored .env.local)
  // short-circuits attestation — the SDK reads this global during init.
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
  if (import.meta.env.DEV && debugToken) {
    ;(
      self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }
    ).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken
  }
  appCheck.initializeAppCheck(app, {
    provider: new appCheck.ReCaptchaEnterpriseProvider(
      RECAPTCHA_ENTERPRISE_SITE_KEY
    ),
    isTokenAutoRefreshEnabled: true,
  })
}

type CallableErrorLike = {
  code?: unknown
  details?: { reason?: unknown; reported?: unknown } | null
}

/**
 * One round trip: send the description (or a followUpPrompt) and validate the
 * answer against the four-tier contract. Returns null when the model replied
 * but not in contract shape — callers treat that like a failed call. A refusal
 * from the allowance throws AiRefusedError; network and service errors
 * propagate as they are. Failures are reported for monitoring (ADR 0014),
 * except those the function already reported itself; `final` marks the
 * answer to a clarifying question.
 */
export async function fillMacros(
  prompt: string,
  final = false
): Promise<AiFillReply | null> {
  const started = performance.now()
  const ctx = () => ({
    model: MODEL_LABEL,
    ms: performance.now() - started,
    final,
  })
  let reply: AiFillResponse
  try {
    await ensureAppCheck()
    reply = await callable<AiFillRequest, AiFillResponse>("aiFill", {
      prompt,
      final,
    })
  } catch (err) {
    const e = (typeof err === "object" && err !== null ? err : {}) as CallableErrorLike
    const reason = e.details?.reason
    if (
      e.code === "functions/resource-exhausted" &&
      (reason === "cycle-exhausted" ||
        reason === "too-fast" ||
        reason === "follow-ups")
    ) {
      throw new AiRefusedError(reason)
    }
    if (e.details?.reported !== true) reportAiFailure(describeAiError(err, ctx()))
    throw err
  }
  const result = parseMacroFillResponse(reply.text)
  if (!result) {
    reportAiFailure(
      describeBadOutput(reply.finishReason, reply.text.length, ctx())
    )
    return null
  }
  return { result, attribution: reply.attribution }
}

// The aiFill function scales to zero when nobody uses it, and a cold start
// adds a second or two. A no-op call when the app opens or comes back starts
// an instance, which stays up for a quarter of an hour; by the time someone
// has typed a food and tapped ✨, it is ready.
const WARM_EVERY_MS = 5 * 60_000
let warmedAt = -Infinity

/** Start an aiFill instance ahead of the first fill; at most every 5 minutes. */
export function warmAiFill(): void {
  const now = Date.now()
  if (now - warmedAt < WARM_EVERY_MS) return
  warmedAt = now
  callable("aiFill", { warm: true }).catch(() => {
    // Only a head start; the fill itself still works cold.
  })
}

// A burst of failures (say, Google down for an afternoon) shouldn't turn one
// phone into a flood of reports; a handful per page load tells us enough.
const MAX_REPORTS_PER_PAGE = 10
let sent = 0

/** Fire and forget: reporting must never slow down or break the fill. */
function reportAiFailure(report: AiFailureReport): void {
  if (sent >= MAX_REPORTS_PER_PAGE) return
  sent++
  callable("reportAiFailure", report).catch(() => {
    // Nowhere left to report to; the user already sees the fill's own error.
  })
}

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore"

import {
  leadSubscription,
  nextEntitlement,
  uidOf,
  type Decision,
  type Entitlement,
  type PaddleSubscription,
  type SeenSubscription,
} from "./entitlement.js"

// Applying Paddle events to Firestore. One transaction per event reads the
// entitlement doc, decides with nextEntitlement, writes the doc and records the
// event id under /paddleEvents — so a redelivered event is applied once, and
// the log doubles as an audit trail. Each subscription's latest state is kept
// under /paddleSubscriptions, so a user with two of them keeps the plan of the
// one still paying (leadSubscription). Both collections sit outside /users and
// are therefore closed to every client by the security rules.

/** The subscription events the notification destination subscribes to. */
export const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.activated",
  "subscription.canceled",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.trialing",
])

export interface PaddleEvent {
  event_id: string
  event_type: string
  occurred_at: string
  data: unknown
}

export type ApplyOutcome =
  | "applied"
  | "duplicate"
  | "ignored-type"
  | "no-uid"
  | `skipped: ${string}`

export function entitlementRef(db: Firestore, uid: string) {
  return db.doc(`users/${uid}/settings/subscription`)
}

export async function applyPaddleEvent(
  db: Firestore,
  event: PaddleEvent
): Promise<ApplyOutcome> {
  if (!SUBSCRIPTION_EVENTS.has(event.event_type)) return "ignored-type"
  const sub = event.data as PaddleSubscription
  const uid = uidOf(sub)
  if (uid === null) return "no-uid"
  return applySubscription(db, uid, sub, new Date(event.occurred_at), event)
}

/**
 * Apply one subscription state for `uid`. Used by the webhook (with the event,
 * for de-duplication) and by the plan-change call, which applies Paddle's
 * reply straight away rather than waiting for the webhook to echo it.
 */
export async function applySubscription(
  db: Firestore,
  uid: string,
  sub: PaddleSubscription,
  occurredAt: Date,
  event?: PaddleEvent
): Promise<ApplyOutcome> {
  const ref = entitlementRef(db, uid)
  const eventRef = event ? db.doc(`paddleEvents/${event.event_id}`) : null
  const subRef = db.doc(`paddleSubscriptions/${sub.id}`)
  return db.runTransaction(async (tx) => {
    if (eventRef && (await tx.get(eventRef)).exists) return "duplicate"
    const prev = fromDoc((await tx.get(ref)).data())
    const seen = (
      await tx.get(db.collection("paddleSubscriptions").where("uid", "==", uid))
    ).docs
      .map((d) => fromSeenDoc(d.data()))
      .filter((s): s is SeenSubscription => s !== null)
    // Staleness is per subscription: an event older than this subscription's
    // last applied state loses. (A doc from before the per-subscription
    // records falls back to the entitlement's own event time.)
    const lastSeen =
      seen.find((s) => s.sub.id === sub.id)?.occurredAt ??
      (prev?.subscriptionId === sub.id ? prev.eventAt : null)
    let decision: Decision
    if (lastSeen && occurredAt.getTime() < lastSeen.getTime()) {
      decision = { kind: "skip", reason: "older than the last applied event" }
    } else {
      const lead = leadSubscription({ sub, occurredAt }, seen)
      // The doc is now derived from every subscription, so it only ever
      // moves forward: stamp it with the later of the two times.
      const at =
        prev && prev.eventAt.getTime() > occurredAt.getTime()
          ? prev.eventAt
          : occurredAt
      decision = nextEntitlement(prev, lead.sub, at)
      tx.set(subRef, {
        uid,
        sub: trimmed(sub),
        occurredAt: Timestamp.fromDate(occurredAt),
      })
    }
    if (decision.kind === "write") {
      tx.set(ref, toDoc(decision.entitlement))
    }
    if (eventRef && event) {
      tx.set(eventRef, {
        type: event.event_type,
        occurredAt: Timestamp.fromDate(occurredAt),
        subscriptionId: sub.id,
        status: sub.status,
        uid,
        outcome: decision.kind === "write" ? "applied" : decision.reason,
        receivedAt: FieldValue.serverTimestamp(),
      })
    }
    return decision.kind === "write"
      ? "applied"
      : (`skipped: ${decision.reason}` as const)
  })
}

/** The fields of a subscription we decide on, safe for Firestore (no undefined). */
function trimmed(sub: PaddleSubscription): PaddleSubscription {
  return JSON.parse(
    JSON.stringify({
      id: sub.id,
      status: sub.status,
      customer_id: sub.customer_id,
      custom_data: { uid: sub.custom_data?.uid ?? null },
      items: sub.items.map((item) => ({
        price: item.price?.id ? { id: item.price.id } : null,
      })),
      current_billing_period: sub.current_billing_period ?? null,
      scheduled_change: sub.scheduled_change ?? null,
    })
  ) as PaddleSubscription
}

function fromSeenDoc(
  data: Record<string, unknown> | undefined
): SeenSubscription | null {
  const occurredAt = data?.occurredAt
  const sub = data?.sub as PaddleSubscription | undefined
  if (!(occurredAt instanceof Timestamp) || !sub?.id) return null
  return { sub, occurredAt: occurredAt.toDate() }
}

function toDoc(e: Entitlement): Record<string, unknown> {
  const ts = (d: Date | null) => (d ? Timestamp.fromDate(d) : null)
  return {
    plan: e.plan,
    billing: e.billing,
    status: e.status,
    provider: e.provider,
    customerId: e.customerId,
    subscriptionId: e.subscriptionId,
    planStartedAt: ts(e.planStartedAt),
    currentPeriodEnd: ts(e.currentPeriodEnd),
    cancelsAt: ts(e.cancelsAt),
    eventAt: ts(e.eventAt),
    updatedAt: FieldValue.serverTimestamp(),
  }
}

export function fromDoc(
  data: Record<string, unknown> | undefined
): Entitlement | null {
  if (!data) return null
  const date = (v: unknown) => (v instanceof Timestamp ? v.toDate() : null)
  const planStartedAt = date(data.planStartedAt)
  const eventAt = date(data.eventAt)
  if (!planStartedAt || !eventAt) return null
  return {
    plan: data.plan as Entitlement["plan"],
    billing: (data.billing ?? null) as Entitlement["billing"],
    status: data.status as Entitlement["status"],
    provider: "paddle",
    customerId: String(data.customerId ?? ""),
    subscriptionId: String(data.subscriptionId ?? ""),
    planStartedAt,
    currentPeriodEnd: date(data.currentPeriodEnd),
    cancelsAt: date(data.cancelsAt),
    eventAt,
  }
}

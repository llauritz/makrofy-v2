import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore"

import {
  nextEntitlement,
  uidOf,
  type Entitlement,
  type PaddleSubscription,
} from "./entitlement.js"

// Applying Paddle events to Firestore. One transaction per event reads the
// entitlement doc, decides with nextEntitlement, writes the doc and records the
// event id under /paddleEvents — so a redelivered event is applied once, and
// the log doubles as an audit trail. /paddleEvents sits outside /users and is
// therefore closed to every client by the security rules.

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
  return db.runTransaction(async (tx) => {
    if (eventRef && (await tx.get(eventRef)).exists) return "duplicate"
    const prev = fromDoc((await tx.get(ref)).data())
    const decision = nextEntitlement(prev, sub, occurredAt)
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

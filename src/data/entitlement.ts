import {
  doc,
  onSnapshot,
  Timestamp,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore"

import type { Billing, Plan } from "@/data/plans"

// The user's plan, read from /users/{uid}/settings/subscription (ADR 0012).
// Only the Paddle webhook writes it (functions/src/webhook.ts); the security
// rules refuse every client write. No doc means Free. The app reads it like
// the Goal — live and offline-cached (ADR 0001) — and derives everything else:
// the AI allowance, the reset date, what the paywall offers.

export type SubscriptionStatus =
  "active" | "trialing" | "past_due" | "paused" | "canceled"

export interface Entitlement {
  plan: Plan
  billing: Billing | null
  status: SubscriptionStatus
  /** When the current plan began — the AI cycle's anchor (ADR 0013). */
  planStartedAt: Date
  /** End of the paid period, renewed by every renewal event. */
  currentPeriodEnd: Date | null
  /** Set while a cancellation is scheduled for the end of the period. */
  cancelsAt: Date | null
}

/**
 * Days a paid plan keeps working past its period end without word from the
 * server (ADR 0012). A renewal always moves currentPeriodEnd forward, so a
 * paying user only hits this after a week with no connection at renewal — and
 * then only until the app syncs again.
 */
export const OFFLINE_GRACE_DAYS = 7

/** Paddle is still collecting (or retrying the card): the plan holds. */
export function isEntitling(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing" || status === "past_due"
}

/** The plan the app acts on: the doc's, unless it lapsed or ran past grace. */
export function effectivePlan(e: Entitlement | null, now: Date): Plan {
  if (e === null || e.plan === "free" || !isEntitling(e.status)) return "free"
  if (
    e.currentPeriodEnd !== null &&
    now.getTime() >
      e.currentPeriodEnd.getTime() + OFFLINE_GRACE_DAYS * 86_400_000
  ) {
    return "free"
  }
  return e.plan
}

/** A raw Firestore doc as an Entitlement; null for none or a malformed one. */
export function parseEntitlement(
  data: Record<string, unknown> | undefined
): Entitlement | null {
  if (!data) return null
  const date = (v: unknown) => (v instanceof Timestamp ? v.toDate() : null)
  const planStartedAt = date(data.planStartedAt)
  const plan = data.plan
  if (
    !planStartedAt ||
    (plan !== "free" && plan !== "pro" && plan !== "unlimited")
  ) {
    return null
  }
  return {
    plan,
    billing:
      data.billing === "monthly" || data.billing === "annual"
        ? data.billing
        : null,
    status: (data.status as SubscriptionStatus) ?? "canceled",
    planStartedAt,
    currentPeriodEnd: date(data.currentPeriodEnd),
    cancelsAt: date(data.cancelsAt),
  }
}

/** Observe the entitlement; null when the user has never subscribed. */
export function listenToEntitlement(
  db: Firestore,
  uid: string,
  onChange: (entitlement: Entitlement | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "users", uid, "settings", "subscription"),
    (snap) => onChange(parseEntitlement(snap.data())),
    (err) => {
      console.error("Entitlement listener failed", err)
      onChange(null)
    }
  )
}

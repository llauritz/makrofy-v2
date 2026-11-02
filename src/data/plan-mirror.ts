import type { CycleUsage } from "@/data/ai-quota"
import type { Entitlement } from "@/data/entitlement"

// The plan's share of the boot mirror (ADR 0011): what the AI cycle needs to
// paint on a returning launch's first frame. The cycle is anchored on the
// account's creation time (from Firebase Auth) or the entitlement doc, and
// its count lives in Firestore; online, neither answers until Auth's server
// round-trip has finished. Without a copy, the fill counter and a used-up
// allowance appeared a second or more into every launch. Kept under its own
// key, written by useSubscriptionState as the live values arrive, so it never
// races the boot mirror's own writes. Stamped with the uid: another profile's
// copy is ignored. Never the source of truth, only the first frame.

export const PLAN_MIRROR_KEY = "yaffle:plan-mirror:v1"

/** The subset of Storage the mirror touches — injectable for tests. */
export type PlanMirrorStore = Pick<Storage, "getItem" | "setItem">

export interface PlanMirror {
  uid: string
  /** When the account was created (Free's cycle anchor); null if unknown. */
  createdMs: number | null
  entitlement: Entitlement | null
  /** The cycle `usage` was counted in (aiCycles/{id}). */
  cycleId: string
  usage: CycleUsage
}

// Dates don't survive JSON; they cross as millis and revive on read.
interface StoredEntitlement
  extends Omit<Entitlement, "planStartedAt" | "currentPeriodEnd" | "cancelsAt"> {
  planStartedAtMs: number
  currentPeriodEndMs: number | null
  cancelsAtMs: number | null
}

interface StoredPlanMirror extends Omit<PlanMirror, "entitlement"> {
  entitlement: StoredEntitlement | null
}

function defaultStore(): PlanMirrorStore | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const num = (v: unknown) => (typeof v === "number" ? v : 0)
const ms = (v: unknown) => (typeof v === "number" ? new Date(v) : null)

/** The mirrored plan state for `uid`, or null when there is none to trust. */
export function readPlanMirror(
  uid: string | null,
  store: PlanMirrorStore | null = defaultStore(),
): PlanMirror | null {
  if (!uid || !store) return null
  try {
    const raw = store.getItem(PLAN_MIRROR_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as StoredPlanMirror
    if (s.uid !== uid || typeof s.cycleId !== "string") return null
    const e = s.entitlement
    const planStartedAt = e ? ms(e.planStartedAtMs) : null
    return {
      uid: s.uid,
      createdMs: typeof s.createdMs === "number" ? s.createdMs : null,
      entitlement:
        e && planStartedAt
          ? {
              plan: e.plan,
              billing: e.billing,
              status: e.status,
              planStartedAt,
              currentPeriodEnd: ms(e.currentPeriodEndMs),
              cancelsAt: ms(e.cancelsAtMs),
            }
          : null,
      cycleId: s.cycleId,
      usage: {
        fills: num(s.usage?.fills),
        calls: num(s.usage?.calls),
        grounded: num(s.usage?.grounded),
      },
    }
  } catch {
    return null
  }
}

/** Remember the plan state for the next launch. Never throws. */
export function writePlanMirror(
  mirror: PlanMirror,
  store: PlanMirrorStore | null = defaultStore(),
): void {
  if (!store) return
  const e = mirror.entitlement
  const stored: StoredPlanMirror = {
    ...mirror,
    entitlement: e && {
      plan: e.plan,
      billing: e.billing,
      status: e.status,
      planStartedAtMs: e.planStartedAt.getTime(),
      currentPeriodEndMs: e.currentPeriodEnd?.getTime() ?? null,
      cancelsAtMs: e.cancelsAt?.getTime() ?? null,
    },
  }
  try {
    const next = JSON.stringify(stored)
    if (store.getItem(PLAN_MIRROR_KEY) !== next) {
      store.setItem(PLAN_MIRROR_KEY, next)
    }
  } catch {
    /* the next launch just waits for the live values */
  }
}

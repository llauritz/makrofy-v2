import {
  doc,
  onSnapshot,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore"

// The one synced setting: /users/{uid}/settings/goal (ADR 0003). The progress
// ring must agree across devices; theme and language stay device-local.
export interface Goal {
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
}

/**
 * The ring needs a Goal to measure against before onboarding (#17) has set
 * one. Spec § Onboarding prefills 2000 kcal, so the walking skeleton falls back
 * to the same figure until the real Goal doc exists.
 */
export const DEFAULT_GOAL_KCAL = 2000

/**
 * How much we yet know about a profile's Goal doc — the load state the
 * first-run gate reads (src/screens/onboarding/gate.ts). "unset" and "loading"
 * are distinct because onboarding must not flash before the first snapshot
 * lands. Produced by useGoalStatus (src/data/hooks.ts) from the listener below.
 */
export type GoalStatus = "loading" | "unset" | "set"

/** Save the Goal, replacing it whole. Queued, not awaited (see addEntry). */
export function setGoal(db: Firestore, uid: string, goal: Goal): void {
  const data: Record<string, unknown> = { kcal: goal.kcal }
  for (const field of ["protein", "fat", "carbs"] as const) {
    if (goal[field] !== undefined) data[field] = goal[field]
  }
  setDoc(goalDoc(db, uid), data).catch((err) => {
    console.error("Goal write failed", err)
  })
}

/** Observe the Goal; null until onboarding has set one. */
export function listenToGoal(
  db: Firestore,
  uid: string,
  onChange: (goal: Goal | null) => void,
): Unsubscribe {
  return onSnapshot(goalDoc(db, uid), (snap) =>
    onChange(snap.exists() ? (snap.data() as Goal) : null),
  )
}

function goalDoc(db: Firestore, uid: string) {
  return doc(db, "users", uid, "settings", "goal")
}

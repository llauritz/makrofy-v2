// React bindings over the data seam's read side. Components subscribe to live
// data through these hooks instead of opening Firestore listeners themselves;
// writes go through the entries/goal module functions (addEntry, updateEntry,
// deleteEntry, setGoal), which take the same db handle. Each hook owns one
// listener, torn down on unmount or when its inputs change, so day-stepping
// swaps the Day listener cleanly (ADR 0001 — the SDK cache serves the switch
// instantly and offline). Until the Guest identity resolves, uid is null and no
// listener is opened; the initial empty state stands (V2 has no sign-out — that
// arrives with #19).
import * as React from "react"
import { onAuthStateChanged } from "firebase/auth"

import { listenToAllEntries, listenToDay, type Entry } from "@/data/entries"
import { listenToGoal, type Goal, type GoalStatus } from "@/data/goal"
import { auth, db } from "@/lib/firebase"

/** The app's current Firebase uid, or null until the Guest identity resolves. */
export function useIdentity(): string | null {
  const [uid, setUid] = React.useState<string | null>(
    () => auth.currentUser?.uid ?? null,
  )
  React.useEffect(
    () => onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null)),
    [],
  )
  return uid
}

/** One Day's Entries, live and in log order (oldest first). */
export function useDay(uid: string | null, day: string): Entry[] {
  const [entries, setEntries] = React.useState<Entry[]>([])
  React.useEffect(() => {
    if (!uid) return
    return listenToDay(db, uid, day, setEntries)
  }, [uid, day])
  return entries
}

/** The synced Goal; null until onboarding sets one (#17). */
export function useGoal(uid: string | null): Goal | null {
  const [goal, setGoal] = React.useState<Goal | null>(null)
  React.useEffect(() => {
    if (!uid) return
    return listenToGoal(db, uid, setGoal)
  }, [uid])
  return goal
}

/**
 * The Goal's load status, for the first-run gate (src/screens/onboarding
 * /gate.ts). `useGoal` collapses "haven't heard yet" and "no Goal" into null;
 * onboarding must tell them apart so a returning user never flashes the goal
 * screen while the first snapshot is in flight. "unset" is decided from the
 * local snapshot so first run works offline; a future signed-in user opening a
 * fresh device (#19) is the one case that could momentarily read "unset".
 */
export function useGoalStatus(uid: string | null): GoalStatus {
  const [status, setStatus] = React.useState<GoalStatus>("loading")
  React.useEffect(() => {
    if (!uid) return
    return listenToGoal(db, uid, (goal) => setStatus(goal ? "set" : "unset"))
  }, [uid])
  // Before a uid resolves the gate reads "loading" regardless of this value
  // (resolveAppView short-circuits on a null uid), so a stale status here can
  // never surface as a wrong screen.
  return status
}

/**
 * The set of Days that have at least one Entry — feeds the week strip's dots.
 * Derived in memory from the full-history listener (ADR 0005), the same one
 * typeahead and stats will read.
 */
export function useLoggedDays(uid: string | null): Set<string> {
  const [days, setDays] = React.useState<Set<string>>(() => new Set())
  React.useEffect(() => {
    if (!uid) return
    return listenToAllEntries(db, uid, (entries) =>
      setDays(new Set(entries.map((entry) => entry.date))),
    )
  }, [uid])
  return days
}

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
import { listenToGoal, type Goal } from "@/data/goal"
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

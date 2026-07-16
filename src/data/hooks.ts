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
import { onAuthStateChanged, onIdTokenChanged, type User } from "firebase/auth"

import {
  listenToAllEntries,
  listenToDay,
  listenToSyncMetadata,
  type Entry,
} from "@/data/entries"
import { listenToGoal, type Goal, type GoalStatus } from "@/data/goal"
import { listenToOverlays } from "@/data/products"
import { auth, db } from "@/lib/firebase"
import {
  resolveSyncStatus,
  type SnapshotMeta,
  type SyncStatus,
} from "@/lib/sync"
import {
  buildProductIndex,
  EMPTY_INDEX,
  EMPTY_OVERLAYS,
  type HistoryEntry,
  type OverlayMap,
  type ProductIndex,
} from "@/lib/suggestions"

/** The app's current Firebase uid, or null until the Guest identity resolves. */
export function useIdentity(): string | null {
  const [uid, setUid] = React.useState<string | null>(
    () => auth.currentUser?.uid ?? null
  )
  React.useEffect(
    () => onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null)),
    []
  )
  return uid
}

/** A plain summary of the current Firebase user, for the Settings sign-in row. */
export interface AuthUser {
  uid: string
  /** A Guest (anonymous) versus a linked Google account (ADR 0002). */
  isAnonymous: boolean
  displayName: string | null
  email: string | null
}

/**
 * The current Firebase user as a summary, or null before it resolves. Uses
 * onIdTokenChanged, not onAuthStateChanged: linking Google onto a Guest keeps
 * the same uid (so onAuthStateChanged never fires) but refreshes the token, and
 * the sign-in row must flip from "Sign in" to the account the moment it does.
 */
export function useAuthUser(): AuthUser | null {
  const [user, setUser] = React.useState<AuthUser | null>(() =>
    summarizeUser(auth.currentUser)
  )
  React.useEffect(
    () => onIdTokenChanged(auth, (u) => setUser(summarizeUser(u))),
    []
  )
  return user
}

function summarizeUser(user: User | null): AuthUser | null {
  if (!user) return null
  return {
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    displayName: user.displayName,
    email: user.email,
  }
}

// How long any non-synced state must persist before it's shown. A normal online
// write acks, and a load's cache→server hop clears, well inside this window — so
// neither flashes the indicator — and a deliberate sign-out re-mints a Guest
// inside it too, so attention never flashes. Only a genuine offline stretch or
// an auth pause outlasts it.
const SYNC_SETTLE_MS = 1200

/**
 * The header sync indicator's live state (spec § PWA & offline). Snapshot
 * metadata drives silent↔pending; losing the identity's token unexpectedly
 * (onIdTokenChanged firing null after we had a user) raises attention, whose tap
 * re-auths. resolveSyncStatus (src/lib/sync.ts) holds the precedence; this hook
 * adds a short settle so a normal load never flashes the indicator, while a
 * genuine offline stretch or an actual auth pause still surfaces.
 */
export function useSyncStatus(uid: string | null): SyncStatus {
  const [meta, setMeta] = React.useState<SnapshotMeta>({
    hasPendingWrites: false,
    fromCache: false,
  })
  const [authExpired, setAuthExpired] = React.useState(false)
  const [display, setDisplay] = React.useState<SyncStatus>("synced")

  React.useEffect(() => {
    if (!uid) return
    return listenToSyncMetadata(db, uid, setMeta)
  }, [uid])

  React.useEffect(() => {
    let hadUser = auth.currentUser !== null
    return onIdTokenChanged(auth, (user) => {
      if (user) {
        hadUser = true
        setAuthExpired(false)
      } else if (hadUser) {
        // Attention is meant for an auth-expired write pause (spec § PWA &
        // offline). A truly silent token expiry keeps currentUser and never
        // fires here, and for a Guest it can't happen at all (anonymous
        // auto-cleanup is off, ADR 0002) — so what we can actually observe is an
        // outright loss of identity: onIdTokenChanged going null after we had a
        // user. A deliberate sign-out fires it too, but the settle rides out the
        // momentary gap before a fresh Guest is minted.
        setAuthExpired(true)
      }
    })
  }, [])

  const target = resolveSyncStatus(meta, { authExpired })
  // Only "synced" shows at once — the user never waits to learn they're fine.
  // Every non-synced state waits out the settle, so a normal online write and a
  // load's cache→server hop stay silent; only a genuine offline stretch or auth
  // pause lasts long enough to surface.
  const immediate = target === "synced"

  // Reflect an immediate target during render (React's supported adjust-state-
  // during-render pattern) so there's no flash and no cascading effect; the
  // deferred case is left to the timer below.
  if (immediate && display !== target) setDisplay(target)

  React.useEffect(() => {
    if (immediate) return
    const timer = setTimeout(() => setDisplay(target), SYNC_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [immediate, target])

  return display
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
 * The set of Days that have at least one Entry — feeds the Day strip's dots.
 * Derived in memory from the full-history listener (ADR 0005), the same one
 * typeahead and stats will read.
 */
export function useLoggedDays(uid: string | null): Set<string> {
  const [days, setDays] = React.useState<Set<string>>(() => new Set())
  React.useEffect(() => {
    if (!uid) return
    return listenToAllEntries(db, uid, (entries) =>
      setDays(new Set(entries.map((entry) => entry.date)))
    )
  }, [uid])
  return days
}

/** Adapt a Firestore Entry to the nutrients-plus-log-time shape the index reads. */
function toHistoryEntry(entry: Entry): HistoryEntry {
  return {
    label: entry.label,
    kcal: entry.kcal,
    protein: entry.protein,
    fat: entry.fat,
    carbs: entry.carbs,
    createdAtMs: entry.createdAt.toMillis(),
  }
}

/**
 * The Product index (ADR 0005), the source for both the typeahead and the
 * Glossary. Two live subscriptions on the same user — the full Entry history
 * and the curation overlay (issue #40, ADR 0009) — are folded together by
 * buildProductIndex: history stays derived, the overlay's stored corrections
 * apply as the final step. The SDK cache serves both listeners, so no extra
 * server read, and a deleted Entry or a merged Product simply falls out with no
 * collection to drift. The rebuild is a cheap reduction over at most a few
 * thousand Entries and only fires on a data change, never on a keystroke.
 */
export function useProductIndex(uid: string | null): ProductIndex {
  // The history is stored with the clock read the moment it arrived, so the
  // frecency `now` is captured in the listener callback — never during render
  // (an impure call there is disallowed and would also destabilize the memo).
  const [feed, setFeed] = React.useState<{
    entries: HistoryEntry[]
    nowMs: number
  }>({ entries: [], nowMs: 0 })
  const [overlays, setOverlays] = React.useState<OverlayMap>(EMPTY_OVERLAYS)
  React.useEffect(() => {
    // No reset on a null uid (matching the sibling hooks): uid only goes null
    // for the moment between sign-out and the fresh Guest, whose listeners then
    // replace both feeds wholesale.
    if (!uid) return
    return listenToAllEntries(db, uid, (es) =>
      setFeed({ entries: es.map(toHistoryEntry), nowMs: Date.now() })
    )
  }, [uid])
  React.useEffect(() => {
    if (!uid) return
    return listenToOverlays(db, uid, setOverlays)
  }, [uid])
  // Fold history + overlay into the index, rebuilding when either changes. An
  // overlay-only change reuses the last history clock — frecency is unmoved by a
  // correction, and a few minutes is nothing against the 3-week half-life.
  return React.useMemo(
    () =>
      feed.entries.length === 0
        ? EMPTY_INDEX
        : buildProductIndex(feed.entries, feed.nowMs, overlays),
    [feed, overlays]
  )
}

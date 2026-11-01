// The boot mirror (issue #69): the last-rendered launch state, kept in
// localStorage so a returning launch paints instantly. Firebase Auth's init
// blocks on a server round-trip (accounts:lookup) before it fires its first
// auth event, and Firestore holds even cache-only snapshots until that first
// event — so on every online launch the SDKs alone leave the splash up for a
// network RTT. The mirror carries exactly what the first paint needs: the uid
// (gates every listener), the Goal (gates the splash), today's Entries (so the
// Day view doesn't flash empty), and the Day strip's logged-day dots and
// today's Coverage label (so neither pops in a beat later). The SDKs then
// reconcile underneath; the mirror is never the source of truth, only the
// first frame.
import { onAuthStateChanged, type Auth, type Unsubscribe } from "firebase/auth"
import { Timestamp, type Firestore } from "firebase/firestore"

import { listenToCoverage, type CoverageLevel } from "@/data/days"
import { listenToAllEntries, listenToDay, type Entry } from "@/data/entries"
import { listenToGoal, type Goal } from "@/data/goal"
import { localDay } from "@/lib/day"

// Version the key: a schema change ships as v2 and old mirrors simply read as
// absent (one splashed launch), never as a parse hazard.
const KEY = "yaffle:boot-mirror:v1"

/** The subset of Storage the mirror touches — injectable for tests. */
export type MirrorStore = Pick<Storage, "getItem" | "setItem">

/** What a launch can paint before Firebase settles. */
export interface BootMirror {
  uid: string
  /** null mirrors a profile whose Goal was genuinely unset. */
  goal: Goal | null
  /** The Day `entries` belongs to; a launch on a later day seeds nothing. */
  day: string
  entries: Entry[]
  /**
   * Every Day holding at least one Entry — the Day strip's dots. Optional: a
   * mirror written before it existed simply seeds no dots.
   */
  loggedDays?: string[]
  /** `day`'s Coverage label; null when unlabelled, absent in older mirrors. */
  coverage?: CoverageLevel | null
}

// Timestamps don't survive JSON; they cross as millis and revive on read.
interface StoredEntry extends Omit<Entry, "createdAt" | "updatedAt"> {
  createdAtMs: number
  updatedAtMs: number
}

interface StoredMirror extends Omit<BootMirror, "entries"> {
  entries: StoredEntry[]
}

function defaultStore(): MirrorStore | null {
  // Touching localStorage can itself throw (storage disabled entirely).
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * The mirrored launch state, or null when there is none to trust — first-ever
 * launch, corrupt payload, or storage unavailable. Null means the splash path,
 * exactly as before the mirror existed.
 */
export function readBootMirror(
  store: MirrorStore | null = defaultStore(),
): BootMirror | null {
  if (!store) return null
  try {
    const raw = store.getItem(KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as StoredMirror
    if (typeof stored.uid !== "string" || typeof stored.day !== "string") {
      return null
    }
    return {
      uid: stored.uid,
      goal: stored.goal,
      day: stored.day,
      entries: stored.entries.map(({ createdAtMs, updatedAtMs, ...entry }) => ({
        ...entry,
        createdAt: Timestamp.fromMillis(createdAtMs),
        updatedAt: Timestamp.fromMillis(updatedAtMs),
      })),
      // Fields added after v1 shipped: absent in an older mirror, which then
      // just seeds no dots / no label.
      ...(Array.isArray(stored.loggedDays) && { loggedDays: stored.loggedDays }),
      ...(stored.coverage !== undefined && { coverage: stored.coverage }),
    }
  } catch {
    return null
  }
}

function writeMirror(store: MirrorStore, mirror: BootMirror): void {
  const stored: StoredMirror = {
    ...mirror,
    entries: mirror.entries.map(({ createdAt, updatedAt, ...entry }) => ({
      ...entry,
      createdAtMs: createdAt.toMillis(),
      updatedAtMs: updatedAt.toMillis(),
    })),
  }
  // Quota or storage failure just means the next launch splashes; never throw
  // into the listener that delivered the data.
  try {
    store.setItem(KEY, JSON.stringify(stored))
  } catch {
    /* mirror stays stale */
  }
}

/**
 * Keep the mirror fresh: follow the identity, and per uid hold a Goal, an
 * all-Entries (for the logged-day dots) and a today's-Day listener, writing the
 * mirror on every change. Each query duplicates one the UI already holds, so
 * the SDK serves them from the same cache and server streams — the mirror adds
 * no reads.
 *
 * "Today" is followed, not fixed at launch: an installed PWA can stay alive in
 * the background for days, and a mirror pinned to the day it was opened would
 * miss everything logged after midnight — the next cold launch would then
 * paint an empty Day until auth settles. So the today's-Day listeners move to
 * the new Day at local midnight and whenever the app returns to the
 * foreground on a later Day.
 *
 * A launch under the uid already mirrored adopts the stored mirror rather than
 * resetting it, so a hook that mounts later in the launch still seeds from real
 * data. A uid switch (sign-out to a fresh Guest, union merge) tears the
 * listeners down and resets the mirrored data at once, so a launch can never
 * seed one profile's data under another's uid; the momentary null between
 * sign-out and the fresh Guest leaves the mirror as-is, matching the hooks'
 * own null handling.
 */
export function startBootMirror(
  auth: Auth,
  db: Firestore,
  store: MirrorStore | null = defaultStore(),
  clock: () => Date = () => new Date(),
): Unsubscribe {
  if (!store) return () => {}
  let mirror: BootMirror | null = readBootMirror(store)
  let uid: string | null = null
  let stopProfile: (() => void) | undefined
  let stopDay: (() => void) | undefined
  let midnight: ReturnType<typeof setTimeout> | undefined

  const write = (patch: Partial<BootMirror>) => {
    if (!mirror) return
    mirror = { ...mirror, ...patch }
    writeMirror(store, mirror)
  }

  const stopListeners = () => {
    stopProfile?.()
    stopDay?.()
    clearTimeout(midnight)
    stopProfile = stopDay = midnight = undefined
  }

  // Point the today's-Day listeners at the current local Day, moving them
  // (and clearing the Day-scoped fields) when the date has rolled over.
  const followToday = () => {
    if (!uid || !mirror) return
    const day = localDay(clock())
    if (stopDay && mirror.day === day) return
    stopDay?.()
    if (mirror.day !== day) write({ day, entries: [], coverage: null })
    // A late snapshot for a Day we've moved off must not land on the new one.
    const forDay = (patch: Partial<BootMirror>) => {
      if (mirror?.day === day) write(patch)
    }
    const stopEntries = listenToDay(db, uid, day, (entries) =>
      forDay({ entries }),
    )
    const stopCoverage = listenToCoverage(db, uid, day, (coverage) =>
      forDay({ coverage }),
    )
    stopDay = () => {
      stopEntries()
      stopCoverage()
    }
    clearTimeout(midnight)
    midnight = setTimeout(followToday, msUntilNextDay(clock()))
  }

  const stopAuth = onAuthStateChanged(auth, (user) => {
    if (!user || user.uid === uid) return
    stopListeners()
    uid = user.uid
    if (mirror?.uid !== user.uid) {
      // Reset first: the fresh profile's truth arrives from its own listeners.
      mirror = {
        uid: user.uid,
        goal: null,
        day: localDay(clock()),
        entries: [],
        loggedDays: [],
        coverage: null,
      }
      writeMirror(store, mirror)
    }
    const stopGoal = listenToGoal(db, user.uid, (goal) => write({ goal }))
    const stopAll = listenToAllEntries(db, user.uid, (entries) => {
      const loggedDays = [...new Set(entries.map((e) => e.date))].sort()
      // Every Entry change lands here; only a change to the set itself is
      // worth a storage write.
      if (loggedDays.join() !== mirror?.loggedDays?.join()) write({ loggedDays })
    })
    stopProfile = () => {
      stopGoal()
      stopAll()
    }
    followToday()
  })

  // Timers don't run while a phone has the app frozen in the background, so
  // also catch a missed midnight on the way back to the foreground.
  const doc = typeof document === "undefined" ? undefined : document
  const onVisible = () => {
    if (doc?.visibilityState === "visible") followToday()
  }
  doc?.addEventListener("visibilitychange", onVisible)

  return () => {
    stopAuth()
    stopListeners()
    doc?.removeEventListener("visibilitychange", onVisible)
  }
}

/** Milliseconds from `now` until just past the next local midnight. */
function msUntilNextDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  // A beat past midnight, so the clock has definitely read the new Day.
  return next.getTime() - now.getTime() + 1_000
}

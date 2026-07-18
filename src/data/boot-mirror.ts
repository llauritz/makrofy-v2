// The boot mirror (issue #69): the last-rendered launch state, kept in
// localStorage so a returning launch paints instantly. Firebase Auth's init
// blocks on a server round-trip (accounts:lookup) before it fires its first
// auth event, and Firestore holds even cache-only snapshots until that first
// event — so on every online launch the SDKs alone leave the splash up for a
// network RTT. The mirror carries exactly what the first paint needs: the uid
// (gates every listener), the Goal (gates the splash), and today's Entries
// (so the Day view doesn't flash empty). The SDKs then reconcile underneath;
// the mirror is never the source of truth, only the first frame.
import { onAuthStateChanged, type Auth, type Unsubscribe } from "firebase/auth"
import { Timestamp, type Firestore } from "firebase/firestore"

import { listenToDay, type Entry } from "@/data/entries"
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
 * Keep the mirror fresh: follow the identity, and per uid hold a Goal listener
 * and a today's-Day listener, writing the mirror on every change. Both queries
 * duplicate ones the UI already holds, so the SDK serves them from the same
 * cache and server streams — the mirror adds no reads. A uid switch (sign-out
 * to a fresh Guest, union merge) tears the listeners down and resets the
 * mirrored data at once, so a launch can never seed one profile's data under
 * another's uid; the momentary null between sign-out and the fresh Guest
 * leaves the mirror as-is, matching the hooks' own null handling.
 */
export function startBootMirror(
  auth: Auth,
  db: Firestore,
  store: MirrorStore | null = defaultStore(),
): Unsubscribe {
  if (!store) return () => {}
  let mirror: BootMirror | null = null
  let stopGoal: (() => void) | undefined
  let stopDay: (() => void) | undefined

  const stopListeners = () => {
    stopGoal?.()
    stopDay?.()
    stopGoal = stopDay = undefined
  }

  const write = (patch: Partial<BootMirror>) => {
    if (!mirror) return
    mirror = { ...mirror, ...patch }
    writeMirror(store, mirror)
  }

  const stopAuth = onAuthStateChanged(auth, (user) => {
    if (!user || user.uid === mirror?.uid) return
    stopListeners()
    // Reset first: the fresh profile's truth arrives from its own listeners.
    mirror = { uid: user.uid, goal: null, day: localDay(new Date()), entries: [] }
    writeMirror(store, mirror)
    stopGoal = listenToGoal(db, user.uid, (goal) => write({ goal }))
    stopDay = listenToDay(db, user.uid, mirror.day, (entries) =>
      write({ entries }),
    )
  })

  return () => {
    stopAuth()
    stopListeners()
  }
}

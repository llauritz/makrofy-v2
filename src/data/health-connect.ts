// Health Connect on the device (ADR 0014): the per-device preferences behind
// the Settings toggles, the nutrition sync runner that mirrors Entries into
// Health Connect, and the cached weight feed for the stats screen.
//
// Everything here is device-local, never Firestore: Health Connect is a store
// on this phone, so a second phone or the web app is unaffected by what one
// phone sends or shows. Nothing here runs before first paint or waits on the
// network — the runner listens to the same full-history listener the app
// already holds and writes after the data settles, and the weight feed paints
// from its cache before it asks Health Connect again.
import * as React from "react"
import type { Firestore, Unsubscribe } from "firebase/firestore"

import { listenToAllEntriesConfirmed, type Entry } from "@/data/entries"
import { localDay } from "@/lib/day"
import {
  applyPlan,
  planNutritionSync,
  readLedgerFor,
  type SyncEntry,
  type SyncLedger,
  type SyncPlan,
} from "@/lib/health-sync"
import type { WeightSample } from "@/lib/weight"
import {
  deleteNutrition,
  HealthConnectError,
  isHealthConnectPlatform,
  readWeight,
  upsertNutrition,
  type HealthPermission,
} from "@/native/health-connect"

const PREFS_KEY = "yaffle:health-connect:v1"
const LEDGER_KEY = "yaffle:health-connect-ledger:v1"
const WEIGHT_KEY = "yaffle:health-weight:v1"

/** The subset of Storage these stores touch — injectable for tests. */
export type HealthStore = Pick<Storage, "getItem" | "setItem">

/** The Settings toggles, per device. */
export interface HealthPrefs {
  /** "Send food to Health Connect". */
  writeFood: boolean
  /**
   * When "Send food" was last switched on. Entries created from then on are
   * sent; earlier ones are not (only new entries — the open backfill question
   * in ADR 0014).
   */
  writeSinceMs: number
  /** "Show weight from Health Connect". */
  readWeight: boolean
  /**
   * Toggles switched off because their permission was found revoked, so
   * Settings can say why. Cleared when that toggle is switched on again.
   */
  revoked: HealthPermission[]
}

export const DEFAULT_HEALTH_PREFS: HealthPrefs = {
  writeFood: false,
  writeSinceMs: 0,
  readWeight: false,
  revoked: [],
}

function defaultStore(): HealthStore | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readJson<T>(store: HealthStore | null, key: string): T | null {
  if (!store) return null
  try {
    const raw = store.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(
  store: HealthStore | null,
  key: string,
  value: unknown
): void {
  if (!store) return
  try {
    store.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or disabled: the next launch starts from defaults */
  }
}

/* ------------------------------------------------------------ preferences */

/** The stored preferences, with defaults filling anything missing or corrupt. */
export function readHealthPrefs(
  store: HealthStore | null = defaultStore()
): HealthPrefs {
  const stored = readJson<Partial<HealthPrefs>>(store, PREFS_KEY)
  if (!stored || typeof stored !== "object") return DEFAULT_HEALTH_PREFS
  return {
    writeFood: stored.writeFood === true,
    writeSinceMs:
      typeof stored.writeSinceMs === "number" ? stored.writeSinceMs : 0,
    readWeight: stored.readWeight === true,
    revoked: Array.isArray(stored.revoked) ? stored.revoked : [],
  }
}

// One in-memory copy shared by every subscriber, so useSyncExternalStore sees
// a stable snapshot and a toggle in Settings reaches the runner at once.
let prefsSnapshot: HealthPrefs | null = null
const prefsListeners = new Set<() => void>()

function currentPrefs(): HealthPrefs {
  prefsSnapshot ??= readHealthPrefs()
  return prefsSnapshot
}

export function updateHealthPrefs(patch: Partial<HealthPrefs>): void {
  prefsSnapshot = { ...currentPrefs(), ...patch }
  writeJson(defaultStore(), PREFS_KEY, prefsSnapshot)
  for (const listener of prefsListeners) listener()
}

/** Switch a toggle on after its permission was granted. */
export function enableHealthToggle(permission: HealthPermission): void {
  const revoked = currentPrefs().revoked.filter((p) => p !== permission)
  updateHealthPrefs(
    permission === "writeNutrition"
      ? { writeFood: true, writeSinceMs: Date.now(), revoked }
      : { readWeight: true, revoked }
  )
}

/** Switch a toggle off — by the user, or because its permission is gone. */
export function disableHealthToggle(
  permission: HealthPermission,
  reason: "user" | "revoked" = "user"
): void {
  const others = currentPrefs().revoked.filter((p) => p !== permission)
  updateHealthPrefs({
    ...(permission === "writeNutrition"
      ? { writeFood: false }
      : { readWeight: false }),
    revoked: reason === "revoked" ? [...others, permission] : others,
  })
}

function subscribePrefs(listener: () => void): () => void {
  prefsListeners.add(listener)
  return () => prefsListeners.delete(listener)
}

/** The Health Connect preferences, live across Settings, stats and the runner. */
export function useHealthPrefs(): HealthPrefs {
  return React.useSyncExternalStore(
    subscribePrefs,
    currentPrefs,
    () => DEFAULT_HEALTH_PREFS
  )
}

/* --------------------------------------------------------- nutrition sync */

// Let a burst of snapshots (a launch's cache→server hop, a write's local echo
// and its acknowledgement) settle into one pass of native writes.
const SETTLE_MS = 1500
// Keep each native call small; a first sync after a union merge can carry a
// few hundred Entries.
const CHUNK = 100

function toSyncEntry(entry: Entry): SyncEntry {
  return {
    id: entry.id,
    date: entry.date,
    label: entry.label,
    kcal: entry.kcal,
    protein: entry.protein,
    fat: entry.fat,
    carbs: entry.carbs,
    mealType: entry.mealType,
    createdAtMs: entry.createdAt.toMillis(),
  }
}

/** What the runner needs from the platform — injectable for tests. */
export interface NutritionSink {
  upsert: typeof upsertNutrition
  remove: typeof deleteNutrition
}

const NATIVE_SINK: NutritionSink = {
  upsert: upsertNutrition,
  remove: deleteNutrition,
}

/**
 * Mirror one profile's Entries into Health Connect until stopped. Every
 * snapshot of the full history is planned against the ledger of what this
 * device last wrote; only the difference reaches the plugin, one pass at a
 * time. A revoked permission stops the runner and calls `onRevoked`.
 */
export function startNutritionSync(
  firestore: Firestore,
  uid: string,
  {
    sinceMs,
    onRevoked,
    sink = NATIVE_SINK,
    store = defaultStore(),
    settleMs = SETTLE_MS,
  }: {
    sinceMs: number
    onRevoked: () => void
    sink?: NutritionSink
    store?: HealthStore | null
    settleMs?: number
  }
): Unsubscribe {
  let latest: { entries: SyncEntry[]; complete: boolean } | null = null
  let ledger = readLedgerFor(readJson<SyncLedger>(store, LEDGER_KEY), uid)
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let dirty = false
  let stopped = false

  const save = () => writeJson(store, LEDGER_KEY, { uid, records: ledger })

  const pass = async () => {
    if (!latest) return
    const plan = planNutritionSync(latest.entries, ledger, {
      sinceMs,
      complete: latest.complete,
    })
    for (let i = 0; i < plan.upserts.length && !stopped; i += CHUNK) {
      const upserts = plan.upserts.slice(i, i + CHUNK)
      await sink.upsert(upserts)
      ledger = applyPlan(ledger, { upserts, deletes: [] })
      save()
    }
    for (let i = 0; i < plan.deletes.length && !stopped; i += CHUNK) {
      const deletes = plan.deletes.slice(i, i + CHUNK)
      await sink.remove(deletes)
      ledger = applyPlan(ledger, { upserts: [], deletes } satisfies SyncPlan)
      save()
    }
  }

  const run = async () => {
    if (running) {
      dirty = true
      return
    }
    running = true
    try {
      do {
        dirty = false
        await pass()
      } while (dirty && !stopped)
    } catch (err) {
      if (err instanceof HealthConnectError && err.kind === "permission") {
        stopped = true
        onRevoked()
      } else {
        // A failed write stays out of the ledger, so the next snapshot retries it.
        console.warn("Health Connect sync failed", err)
      }
    } finally {
      running = false
    }
  }

  const stopListener = listenToAllEntriesConfirmed(
    firestore,
    uid,
    (entries, fromCache) => {
      latest = { entries: entries.map(toSyncEntry), complete: !fromCache }
      clearTimeout(timer)
      timer = setTimeout(() => void run(), settleMs)
    }
  )

  return () => {
    stopped = true
    clearTimeout(timer)
    stopListener()
  }
}

/* ----------------------------------------------------------------- weight */

// How far back the stats screen asks for weigh-ins. Health Connect itself
// only hands out data from 30 days before the permission was first granted
// (anything older needs the history permission, which Yaffle doesn't ask
// for), so the window fills in as the user keeps the toggle on.
const WEIGHT_LOOKBACK_DAYS = 90

interface WeightCache {
  samples: WeightSample[]
  fetchedAtMs: number
}

export function readWeightCache(
  store: HealthStore | null = defaultStore()
): WeightSample[] | null {
  const cache = readJson<WeightCache>(store, WEIGHT_KEY)
  return cache && Array.isArray(cache.samples) ? cache.samples : null
}

/**
 * Weigh-ins from Health Connect for the stats screen while "Show weight" is
 * on; null while it is off or nothing was ever read. Paints from the device
 * cache first, then asks Health Connect again in the background each time the
 * stats screen opens.
 */
export function useHealthWeight(): WeightSample[] | null {
  const { readWeight: enabled } = useHealthPrefs()
  const [samples, setSamples] = React.useState<WeightSample[] | null>(() =>
    readWeightCache()
  )

  React.useEffect(() => {
    if (!enabled || !isHealthConnectPlatform()) return
    let cancelled = false
    const now = Date.now()
    const start = new Date(
      localDay(new Date(now - WEIGHT_LOOKBACK_DAYS * 86_400_000)) + "T00:00:00"
    ).getTime()
    readWeight(start, now)
      .then((fresh) => {
        if (cancelled) return
        writeJson(defaultStore(), WEIGHT_KEY, {
          samples: fresh,
          fetchedAtMs: now,
        } satisfies WeightCache)
        setSamples(fresh)
      })
      .catch((err: unknown) => {
        if (err instanceof HealthConnectError && err.kind === "permission") {
          disableHealthToggle("readWeight", "revoked")
        } else {
          console.warn("Health Connect weight read failed", err)
        }
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return enabled ? samples : null
}

import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
  type QuerySnapshot,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore"

import { commitInChunks } from "@/data/firestore-batch"
import { localDay } from "@/lib/day"
import type { SnapshotMeta } from "@/lib/sync"

export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "unknown"
export type EntrySource = "manual" | "history" | "ai"
export type FlaggableField = "kcal" | "protein" | "fat" | "carbs"

// Schema per ADR 0003 — one flat collection /users/{uid}/entries/{autoId}.
export interface Entry {
  id: string
  /** The device-local Day this Entry counts toward, 'YYYY-MM-DD'. */
  date: string
  /** The user's text; AI never rewrites it. */
  label: string
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
  mealType: MealType
  source: EntrySource
  /** Values still unsure at commit; persists past commit. */
  flagged?: FlaggableField[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** The label, calories and optional macros shared by new and edited Entries. */
export interface EntryNutrients {
  label: string
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
}

export interface NewEntry extends EntryNutrients {
  date: string
  source: EntrySource
  flagged?: FlaggableField[]
}

/**
 * The mutable fields of an Entry. Editing never moves an Entry to another Day
 * — date, mealType and createdAt are fixed at commit. An absent optional
 * macro means "cleared": the field is removed. `flagged` present means the
 * editor reconciled the Entry's Flagged values (seeded outlines,
 * tap-to-accept — #53); `source` present restamps the provenance (the
 * editor's ✨ fill arriving under Save); either absent leaves the Entry's
 * value untouched.
 */
export type EntryEdit = EntryNutrients & {
  source?: EntrySource
  flagged?: FlaggableField[]
}

/**
 * An AI fill landing on a logged Entry (#53): only the fields the Entry was
 * missing — a logged value is never overwritten — plus the fields the model
 * was still unsure about among those it filled.
 */
export interface EntryAiFill {
  kcal?: number
  protein?: number
  fat?: number
  carbs?: number
  flagged?: FlaggableField[]
}

/**
 * Meal type is attached silently, never shown in V2 UI — it exists as the
 * Health Connect hook (ADR 0003). Windows are a pragmatic reading of the
 * clock: breakfast 04–11, lunch 11–15, dinner 17–22, snack in the gaps
 * (afternoon and late night).
 */
export function deriveMealType(now: Date): MealType {
  const hour = now.getHours()
  if (hour >= 4 && hour < 11) return "breakfast"
  if (hour >= 11 && hour < 15) return "lunch"
  if (hour >= 17 && hour < 22) return "dinner"
  return "snack"
}

/**
 * Commit a new Entry and return its id. The write is queued, not awaited —
 * offline it would never be server-acknowledged, and the SDK's latency
 * compensation shows it in listeners immediately (ADR 0001). The clock only
 * says something about when the food was eaten if the Entry is for today;
 * on Backfill the meal type is 'unknown'.
 */
export function addEntry(db: Firestore, uid: string, entry: NewEntry): string {
  const now = new Date()
  const data: Record<string, unknown> = {
    date: entry.date,
    label: entry.label,
    kcal: entry.kcal,
    mealType: entry.date === localDay(now) ? deriveMealType(now) : "unknown",
    source: entry.source,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  assignPresentMacros(data, entry)
  const ref = doc(entriesCollection(db, uid))
  setDoc(ref, data).catch((err) => {
    console.error("Entry write failed", ref.id, err)
  })
  return ref.id
}

/**
 * Rewrite an Entry's mutable fields in place — same id, same Day. Optional
 * macros absent from the edit are deleted from the document, so blanking a
 * field in the editor truly removes it. Queued, not awaited (see addEntry).
 */
export function updateEntry(
  db: Firestore,
  uid: string,
  id: string,
  edit: EntryEdit,
): void {
  const data: Record<string, unknown> = {
    label: edit.label,
    kcal: edit.kcal,
    updatedAt: serverTimestamp(),
  }
  // A cleared macro is removed. Flags: an edit that carries flagged reconciles
  // it — the editor's Save persists the Flagged values still standing after
  // tap-to-accept (#53, amending ADR 0003) — and one that says nothing about
  // flags leaves them untouched.
  for (const field of ["protein", "fat", "carbs"] as const) {
    data[field] = edit[field] !== undefined ? edit[field] : deleteField()
  }
  if (edit.flagged !== undefined) {
    data.flagged = edit.flagged.length > 0 ? edit.flagged : deleteField()
  }
  if (edit.source !== undefined) data.source = edit.source
  updateDoc(doc(entriesCollection(db, uid), id), data).catch((err) => {
    console.error("Entry update failed", id, err)
  })
}

/**
 * Land an AI fill on a logged Entry (#53): write only the provided fields —
 * the caller sends just what the Entry was missing (entryFillFrom), so logged
 * values are never overwritten — stamp the ✨ provenance, and persist the
 * fields the model was still unsure about. The label is never touched.
 * Queued, not awaited (see addEntry).
 */
export function applyAiFill(
  db: Firestore,
  uid: string,
  id: string,
  fill: EntryAiFill,
): void {
  const data: Record<string, unknown> = {
    source: "ai",
    updatedAt: serverTimestamp(),
  }
  for (const field of ["kcal", "protein", "fat", "carbs", "flagged"] as const) {
    if (fill[field] !== undefined) data[field] = fill[field]
  }
  updateDoc(doc(entriesCollection(db, uid), id), data).catch((err) => {
    console.error("Entry AI fill failed", id, err)
  })
}

/** Native document delete — no tombstones (ADR 0004). Queued like addEntry. */
export function deleteEntry(db: Firestore, uid: string, id: string): void {
  deleteDoc(doc(entriesCollection(db, uid), id)).catch((err) => {
    console.error("Entry delete failed", id, err)
  })
}

/** Observe one Day's Entries in log order. */
export function listenToDay(
  db: Firestore,
  uid: string,
  day: string,
  onChange: (entries: Entry[]) => void,
): Unsubscribe {
  // Sorted client-side: a Day holds at most dozens of Entries, and
  // where('date') + orderBy('createdAt') would need a composite index.
  return onSnapshot(dayQuery(db, uid, day), (snap) =>
    onChange(
      toEntries(snap).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis()),
    ),
  )
}

/**
 * Observe whether one Day's Entries are still served from the local cache
 * (true) or confirmed current by the server (false) — the feed for the faint
 * "still updating" spinner under the log. Same query as listenToDay, so the SDK
 * shares one target between the two; metadata-only changes are included so
 * the flip to server-confirmed lands even when no Entry changed.
 */
export function listenToDayFreshness(
  db: Firestore,
  uid: string,
  day: string,
  onChange: (fromCache: boolean) => void,
): Unsubscribe {
  return onSnapshot(
    dayQuery(db, uid, day),
    { includeMetadataChanges: true },
    (snap) => onChange(snap.metadata.fromCache),
  )
}

// The full history without paying for it on every launch (ADR 0017). Firestore
// bills a listener that has been away for more than 30 minutes as a brand-new
// query, so a live listener on the whole collection re-read every Entry each
// time the app came back after a break — a cost that grew with every month of
// logging. Instead the history is split at a cutoff Day:
//
//   recent — the last RECENT_DAYS Days, a normal live listener: edits and
//            deletes from another device arrive as they happen.
//   older  — everything before, read from the phone's own cache (free) by a
//            cache-only listener, so local edits and deletes still show at
//            once. A server read refreshes it once every REFRESH_DAYS, on a
//            new device, or when the cache holds fewer Entries than the last
//            refresh saw.
//
// Entries never move to another Day (EntryEdit), so an Entry belongs to one
// half for good, apart from the slow drift of the cutoff itself.

/** Days covered by the live listener. */
export const RECENT_DAYS = 35
/** Days between server refreshes of the older history. */
export const REFRESH_DAYS = 7
/** Give up on a refresh that hasn't completed in this long. */
const REFRESH_TIMEOUT_MS = 60_000

/** The first Day the live listener covers. */
export function historyCutoff(now: Date): string {
  return localDay(new Date(now.getTime() - RECENT_DAYS * 86_400_000))
}

function recentQuery(db: Firestore, uid: string, cutoff: string) {
  return query(entriesCollection(db, uid), where("date", ">=", cutoff))
}

function olderQuery(db: Firestore, uid: string, cutoff: string) {
  return query(entriesCollection(db, uid), where("date", "<", cutoff))
}

interface RefreshMark {
  /** When the last server refresh completed, ms. */
  at: number
  /** How many older Entries it saw. */
  count: number
}

const refreshKey = (uid: string) => `yaffle.history-refresh.${uid}`

function readRefreshMark(uid: string): RefreshMark | null {
  try {
    const raw = localStorage.getItem(refreshKey(uid))
    const mark = raw ? (JSON.parse(raw) as Partial<RefreshMark>) : null
    return typeof mark?.at === "number" && typeof mark.count === "number"
      ? { at: mark.at, count: mark.count }
      : null
  } catch {
    return null
  }
}

function writeRefreshMark(uid: string, mark: RefreshMark): void {
  try {
    localStorage.setItem(refreshKey(uid), JSON.stringify(mark))
  } catch {
    // No storage: the next launch refreshes again, which is only a cost.
  }
}

/** Whether the older history needs a server read now. */
export function needsRefresh(
  mark: RefreshMark | null,
  cachedCount: number,
  nowMs: number,
): boolean {
  if (mark === null) return true
  if (nowMs - mark.at >= REFRESH_DAYS * 86_400_000) return true
  // The cache dropped Entries it held (evicted, or cleared by the browser).
  return cachedCount < mark.count
}

const refreshing = new Set<string>()

/**
 * Bring the cached older history up to date with the server: attach a live
 * listener until the server has confirmed the whole result — the SDK reports
 * fromCache: false only once it has also resolved Entries deleted elsewhere —
 * then let it go. The cache-only listeners pick up the result.
 */
function refreshOlder(db: Firestore, uid: string, cutoff: string): void {
  if (refreshing.has(uid)) return
  refreshing.add(uid)
  let stop: Unsubscribe | null = null
  const done = () => {
    clearTimeout(timer)
    stop?.()
    stop = null
    refreshing.delete(uid)
  }
  const timer = setTimeout(done, REFRESH_TIMEOUT_MS)
  stop = onSnapshot(
    olderQuery(db, uid, cutoff),
    { includeMetadataChanges: true },
    (snap) => {
      if (snap.metadata.fromCache) return
      writeRefreshMark(uid, { at: Date.now(), count: snap.size })
      done()
    },
    (err) => {
      console.error("History refresh failed", err)
      done()
    },
  )
}

/** Observe the full Entry history — feeds typeahead (ADR 0005) and stats. */
export function listenToAllEntries(
  db: Firestore,
  uid: string,
  onChange: (entries: Entry[]) => void,
): Unsubscribe {
  const cutoff = historyCutoff(new Date())
  let recent: Entry[] | null = null
  let older: Entry[] | null = null
  let checked = false
  const emit = () => {
    if (recent !== null && older !== null) onChange([...older, ...recent])
  }
  const stopRecent = onSnapshot(recentQuery(db, uid, cutoff), (snap) => {
    recent = toEntries(snap)
    emit()
  })
  const stopOlder = onSnapshot(
    olderQuery(db, uid, cutoff),
    { source: "cache" },
    (snap) => {
      older = toEntries(snap)
      if (!checked) {
        checked = true
        if (needsRefresh(readRefreshMark(uid), snap.size, Date.now())) {
          refreshOlder(db, uid, cutoff)
        }
      }
      emit()
    },
  )
  return () => {
    stopRecent()
    stopOlder()
  }
}

/** Whether a profile has logged anything, as the first-run gate sees it. */
export type EntriesStatus = "loading" | "none" | "some"

/**
 * Observe whether the profile holds any Entry at all; one document answers it.
 * The first-run gate (src/screens/onboarding/gate.ts) reads it so a profile
 * that logged before onboarding existed (#35) is never sent through it.
 */
export function listenToHasEntries(
  db: Firestore,
  uid: string,
  onChange: (hasEntries: boolean) => void,
): Unsubscribe {
  return onSnapshot(query(entriesCollection(db, uid), limit(1)), (snap) =>
    onChange(!snap.empty),
  )
}

/**
 * Watch a profile's sync health, the header indicator's live feed (spec § PWA &
 * offline). The entries collection stands in for the whole connection:
 * `fromCache` flips true whenever the client can't reach the server, and
 * `hasPendingWrites` covers the queued Entry writes that dominate the app.
 * Metadata-only changes are included so the indicator settles the moment a write
 * is acknowledged, without a document ever changing.
 */
export function listenToSyncMetadata(
  db: Firestore,
  uid: string,
  onChange: (meta: SnapshotMeta) => void,
): Unsubscribe {
  // The same two halves as listenToAllEntries (and the same targets, so no
  // extra reads): the live recent half says whether the server is reachable,
  // and either half can hold a queued write — an edit to an old Day lands in
  // the cache-only older half.
  const cutoff = historyCutoff(new Date())
  let recent: SnapshotMeta | null = null
  let olderPending = false
  const emit = () => {
    if (recent === null) return
    onChange({
      hasPendingWrites: recent.hasPendingWrites || olderPending,
      fromCache: recent.fromCache,
    })
  }
  const stopRecent = onSnapshot(
    recentQuery(db, uid, cutoff),
    { includeMetadataChanges: true },
    (snap) => {
      recent = {
        hasPendingWrites: snap.metadata.hasPendingWrites,
        fromCache: snap.metadata.fromCache,
      }
      emit()
    },
  )
  const stopOlder = onSnapshot(
    olderQuery(db, uid, cutoff),
    { includeMetadataChanges: true, source: "cache" },
    (snap) => {
      olderPending = snap.metadata.hasPendingWrites
      emit()
    },
  )
  return () => {
    stopRecent()
    stopOlder()
  }
}

/**
 * One-shot read of a profile's whole Entry history — the merge source when a
 * Guest signs into an existing account (ADR 0002, #19). Estimated server
 * timestamps keep createdAt a real Timestamp even for a still-pending write,
 * matching the listeners.
 */
export async function readAllEntries(db: Firestore, uid: string): Promise<Entry[]> {
  return toEntries(await getDocs(entriesCollection(db, uid)))
}

/**
 * Batch-write whole Entries under a uid, each keeping its id and every stored
 * field — original timestamps included. This is the copy half of the union
 * merge (ADR 0002) and the write half of a backup import (#24): Firestore
 * auto-ids are collision-free, so writing another profile's Entries in by id is
 * a clean union that never clobbers what is already there. Chunked under the
 * 500-op batch cap for whole-history writes; a no-op for an empty set.
 */
export async function writeEntries(
  db: Firestore,
  uid: string,
  entries: Entry[],
): Promise<void> {
  await commitInChunks(db, entries.length, (batch, i) => {
    batch.set(doc(entriesCollection(db, uid), entries[i].id), toDocData(entries[i]))
  })
}

// An Entry's persisted shape — every stored field but the id (that's the
// document key). Undefined optionals are omitted, mirroring how they were
// written, so a copy is byte-for-byte the same document.
function toDocData(entry: Entry): Record<string, unknown> {
  const data: Record<string, unknown> = {
    date: entry.date,
    label: entry.label,
    kcal: entry.kcal,
    mealType: entry.mealType,
    source: entry.source,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }
  assignPresentMacros(data, entry)
  return data
}

// Copy the optional macro and flag fields that are set, omitting undefined ones
// — the shape a new write (addEntry) and a merge copy (toDocData) both need.
function assignPresentMacros(
  data: Record<string, unknown>,
  source: Pick<Entry, "protein" | "fat" | "carbs" | "flagged">,
): void {
  for (const field of ["protein", "fat", "carbs", "flagged"] as const) {
    if (source[field] !== undefined) data[field] = source[field]
  }
}

function entriesCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "entries")
}

function dayQuery(db: Firestore, uid: string, day: string) {
  return query(entriesCollection(db, uid), where("date", "==", day))
}

function toEntries(snap: QuerySnapshot): Entry[] {
  // 'estimate' keeps createdAt a real Timestamp while a queued write's
  // server timestamp is still pending, so ordering never sees nulls.
  return snap.docs.map(
    (d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }) as Entry,
  )
}

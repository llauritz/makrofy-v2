import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type QuerySnapshot,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore"

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
  const q = query(entriesCollection(db, uid), where("date", "==", day))
  return onSnapshot(q, (snap) =>
    onChange(
      toEntries(snap).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis()),
    ),
  )
}

/** Observe the full Entry history — feeds typeahead (ADR 0005) and stats. */
export function listenToAllEntries(
  db: Firestore,
  uid: string,
  onChange: (entries: Entry[]) => void,
): Unsubscribe {
  return onSnapshot(entriesCollection(db, uid), (snap) => onChange(toEntries(snap)))
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
  return onSnapshot(
    entriesCollection(db, uid),
    { includeMetadataChanges: true },
    (snap) =>
      onChange({
        hasPendingWrites: snap.metadata.hasPendingWrites,
        fromCache: snap.metadata.fromCache,
      }),
  )
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
 * merge (ADR 0002): Firestore auto-ids are collision-free, so writing a Guest's
 * Entries into an existing account is a clean union that never clobbers what is
 * already there. A no-op for an empty set.
 */
export async function writeEntries(
  db: Firestore,
  uid: string,
  entries: Entry[],
): Promise<void> {
  if (entries.length === 0) return
  const batch = writeBatch(db)
  for (const entry of entries) {
    batch.set(doc(entriesCollection(db, uid), entry.id), toDocData(entry))
  }
  await batch.commit()
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

function toEntries(snap: QuerySnapshot): Entry[] {
  // 'estimate' keeps createdAt a real Timestamp while a queued write's
  // server timestamp is still pending, so ordering never sees nulls.
  return snap.docs.map(
    (d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }) as Entry,
  )
}

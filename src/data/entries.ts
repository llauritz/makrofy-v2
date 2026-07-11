import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
  type QuerySnapshot,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore"

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

export interface NewEntry {
  date: string
  label: string
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
  source: EntrySource
  flagged?: FlaggableField[]
}

/** The device-local Day a moment belongs to. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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
  for (const field of ["protein", "fat", "carbs", "flagged"] as const) {
    if (entry[field] !== undefined) data[field] = entry[field]
  }
  const ref = doc(entriesCollection(db, uid))
  setDoc(ref, data).catch((err) => {
    console.error("Entry write failed", ref.id, err)
  })
  return ref.id
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

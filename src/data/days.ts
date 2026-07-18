import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Firestore,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore"

// The per-Day metadata sidecar: /users/{uid}/days/{YYYY-MM-DD} (ADR 0006).
// A doc exists only for Days the user has labelled; absence means "no
// metadata", never "no day" — Entries stay the single source of truth, this
// collection only annotates. Only non-derivable, user-authored fields live
// here, never cached aggregates.

/**
 * Coverage (CONTEXT.md): how much of a Day's real intake the user says made
 * it into the log. Governs only aggregate-stats admission (#22), never the
 * live day view; an unlabelled Day is treated as fully covered.
 */
export type CoverageLevel = "some" | "most" | "everything"

/** Label a Day's Coverage, replacing any prior label. Queued, not awaited (see addEntry). */
export function setCoverage(
  db: Firestore,
  uid: string,
  day: string,
  level: CoverageLevel,
): void {
  setDoc(dayDoc(db, uid, day), {
    coverage: level,
    updatedAt: serverTimestamp(),
  }).catch((err) => {
    console.error("Coverage write failed", day, err)
  })
}

/**
 * Remove a Day's label — a native delete of the doc (ADR 0004, no
 * tombstones), returning the Day to the trusted default. Queued like setCoverage.
 */
export function clearCoverage(db: Firestore, uid: string, day: string): void {
  deleteDoc(dayDoc(db, uid, day)).catch((err) => {
    console.error("Coverage clear failed", day, err)
  })
}

/** Observe one Day's Coverage; null while the Day is unlabelled. */
export function listenToCoverage(
  db: Firestore,
  uid: string,
  day: string,
  onChange: (level: CoverageLevel | null) => void,
): Unsubscribe {
  return onSnapshot(dayDoc(db, uid, day), (snap) =>
    onChange(snap.exists() ? (snap.data().coverage as CoverageLevel) : null),
  )
}

/** Every labelled Day in a window, keyed by Day. Empty map = none labelled. */
export type CoverageMap = Map<string, CoverageLevel>

/**
 * Observe every Coverage label between `start` and `end` (inclusive Days) —
 * the stats feed (#22). The doc id *is* the date (ADR 0006), so the window is
 * a documentId range query; unlabelled Days simply aren't in the map.
 */
export function listenToCoverageInRange(
  db: Firestore,
  uid: string,
  start: string,
  end: string,
  onChange: (labels: CoverageMap) => void,
): Unsubscribe {
  const q = query(
    daysCollection(db, uid),
    where(documentId(), ">=", start),
    where(documentId(), "<=", end),
  )
  return onSnapshot(q, (snap) =>
    onChange(
      new Map(snap.docs.map((d) => [d.id, d.data().coverage as CoverageLevel])),
    ),
  )
}

/** A whole days doc — the shape the union merge copies (ADR 0006). */
export interface DayDoc {
  /** The Day, 'YYYY-MM-DD' — the document's id. */
  day: string
  coverage: CoverageLevel
  updatedAt: Timestamp
}

/**
 * One-shot read of every labelled Day — the merge source when a Guest signs
 * into an existing account (ADR 0002). Estimated server timestamps keep
 * updatedAt a real Timestamp even for a still-pending write.
 */
export async function readAllDays(db: Firestore, uid: string): Promise<DayDoc[]> {
  const snap = await getDocs(daysCollection(db, uid))
  return snap.docs.map((d) => ({
    day: d.id,
    ...(d.data({ serverTimestamps: "estimate" }) as Omit<DayDoc, "day">),
  }))
}

/**
 * Write only the dates the destination account lacks — the union merge's
 * "existing account's days doc wins" rule (ADR 0006): Coverage is a
 * settings-like per-date annotation, not union-able like Entries. A no-op for
 * an empty set.
 */
export async function writeMissingDays(
  db: Firestore,
  uid: string,
  days: DayDoc[],
): Promise<void> {
  if (days.length === 0) return
  const existing = await getDocs(daysCollection(db, uid))
  const have = new Set(existing.docs.map((d) => d.id))
  const batch = writeBatch(db)
  let pending = 0
  for (const { day, ...data } of days) {
    if (have.has(day)) continue
    batch.set(dayDoc(db, uid, day), data)
    pending += 1
  }
  if (pending > 0) await batch.commit()
}

function daysCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "days")
}

function dayDoc(db: Firestore, uid: string, day: string) {
  return doc(db, "users", uid, "days", day)
}

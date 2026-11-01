import { localDay } from "@/lib/day"

// The Health Connect sync rules (ADR 0014), pure and Firestore-free so they
// stay testable without a device. Yaffle mirrors Entries one way, into Health
// Connect: one NutritionRecord per Entry, keyed by the Entry id as its client
// record id, so an edit rewrites the same record and a delete removes it.
//
// The runner (src/data/health-connect.ts) feeds every full-history snapshot
// through planNutritionSync and applies the plan with the native plugin; the
// ledger it keeps on the device records what this phone last wrote, so a
// snapshot that changes nothing writes nothing.

export type HealthMealType =
  "breakfast" | "lunch" | "dinner" | "snack" | "unknown"

/** The slice of an Entry the sync reads. */
export interface SyncEntry {
  id: string
  date: string
  label: string
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
  mealType: HealthMealType
  createdAtMs: number
}

/** What the native plugin writes as one NutritionRecord. */
export interface NutritionRecordInput {
  /** The Entry id — Health Connect's client record id. */
  clientRecordId: string
  name: string
  startTimeMs: number
  endTimeMs: number
  mealType: HealthMealType
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
}

/**
 * What this device last wrote to Health Connect: Entry id → the fingerprint of
 * the record written for it. Scoped to one uid; a different profile starts
 * from an empty ledger (see readLedgerFor).
 */
export interface SyncLedger {
  uid: string
  records: Record<string, string>
}

export interface SyncPlan {
  upserts: NutritionRecordInput[]
  deletes: string[]
}

// Health Connect needs an interval with end after start. A meal has no real
// duration in Yaffle, so every record spans one minute from its start.
const RECORD_SPAN_MS = 60_000

/**
 * When the food was eaten, as well as Yaffle knows. An Entry logged on the Day
 * it counts toward was eaten around when it was logged. A Backfilled Entry
 * says nothing about the hour, so it lands at local noon of its Day — always
 * inside that Day in Health Connect's daily totals, whatever the time zone.
 */
export function recordStartMs(
  entry: Pick<SyncEntry, "date" | "createdAtMs">
): number {
  const created = new Date(entry.createdAtMs)
  if (localDay(created) === entry.date) return entry.createdAtMs
  const [y, m, d] = entry.date.split("-").map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
}

/**
 * Whether an Entry has anything worth sending. A 0-kcal Entry with no macros
 * is the dashed row still waiting for its numbers; writing it would put an
 * empty meal into the user's health data.
 */
export function isWritable(entry: SyncEntry): boolean {
  return (
    entry.kcal > 0 ||
    (entry.protein ?? 0) > 0 ||
    (entry.fat ?? 0) > 0 ||
    (entry.carbs ?? 0) > 0
  )
}

/** Map an Entry to the record the plugin writes for it. */
export function toNutritionRecord(entry: SyncEntry): NutritionRecordInput {
  const start = recordStartMs(entry)
  const record: NutritionRecordInput = {
    clientRecordId: entry.id,
    name: entry.label,
    startTimeMs: start,
    endTimeMs: start + RECORD_SPAN_MS,
    mealType: entry.mealType,
    kcal: entry.kcal,
  }
  if (entry.protein !== undefined) record.protein = entry.protein
  if (entry.fat !== undefined) record.fat = entry.fat
  if (entry.carbs !== undefined) record.carbs = entry.carbs
  return record
}

/**
 * A stable string for a record's content. Timestamps settling from the
 * SDK's local estimate to the server's value don't change it, so only a real
 * edit triggers a rewrite.
 */
export function fingerprint(record: NutritionRecordInput): string {
  return JSON.stringify([
    record.name,
    record.startTimeMs,
    record.mealType,
    record.kcal,
    record.protein ?? null,
    record.fat ?? null,
    record.carbs ?? null,
  ])
}

export interface PlanOptions {
  /**
   * Entries created at or after this moment are sent: the "Send food" toggle's
   * last switch-on. Earlier Entries are only kept up to date if this device
   * already wrote them (they are in the ledger).
   */
  sinceMs: number
  /**
   * Whether the snapshot is server-confirmed. A cache-only snapshot can be
   * missing Entries (a fresh install, another device's writes not yet
   * pulled), so an Entry absent from it is never taken as deleted.
   */
  complete: boolean
}

/**
 * The writes that bring Health Connect in line with the Entry history:
 * upserts for eligible Entries whose record changed or was never written,
 * and deletes for written records whose Entry is gone or no longer writable.
 */
export function planNutritionSync(
  entries: readonly SyncEntry[],
  ledger: Record<string, string>,
  { sinceMs, complete }: PlanOptions
): SyncPlan {
  const upserts: NutritionRecordInput[] = []
  const deletes: string[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    seen.add(entry.id)
    const written = entry.id in ledger
    if (!written && entry.createdAtMs < sinceMs) continue
    if (!isWritable(entry)) {
      if (written) deletes.push(entry.id)
      continue
    }
    const record = toNutritionRecord(entry)
    if (ledger[entry.id] !== fingerprint(record)) upserts.push(record)
  }

  if (complete) {
    for (const id of Object.keys(ledger)) {
      if (!seen.has(id)) deletes.push(id)
    }
  }

  return { upserts, deletes }
}

/** The ledger after a plan's writes succeeded. */
export function applyPlan(
  ledger: Record<string, string>,
  plan: SyncPlan
): Record<string, string> {
  const next = { ...ledger }
  for (const record of plan.upserts)
    next[record.clientRecordId] = fingerprint(record)
  for (const id of plan.deletes) delete next[id]
  return next
}

/** The ledger for `uid`: a stored ledger of another profile reads as empty. */
export function readLedgerFor(
  stored: SyncLedger | null,
  uid: string
): Record<string, string> {
  return stored && stored.uid === uid ? stored.records : {}
}

// The makrofy/2 backup format (spec § Export / import, issue #24). A single
// versioned JSON file carrying a whole profile: every Entry (full ADR 0003
// schema), the Goal, the per-Day Coverage sidecar (ADR 0006) and the Glossary
// curation overlay (ADR 0009) — the annotations a plain Entry dump would lose.
// V2 speaks only its own format: this parse rejects anything not tagged
// makrofy/2 rather than attempting a V1 conversion ([#11]).
//
// Kept Firestore-free, so it stays trivially testable and is the one home for
// the shape and its validation. Firestore Timestamps live outside JSON, so the
// stored `createdAt`/`updatedAt` become epoch-ms numbers here; the data layer
// (src/data/backup.ts) does the Timestamp ↔ ms conversion at the I/O boundary.
// The overlay's own timestamps are already plain ms (ADR 0009), so it travels
// verbatim.
import type { CoverageLevel } from "@/data/days"
import type { EntrySource, FlaggableField, MealType } from "@/data/entries"
import type { Goal } from "@/data/goal"
import type { ProductOverlay } from "@/lib/suggestions"

export const BACKUP_FORMAT = "makrofy/2"

/** An Entry as it travels in a backup: the stored doc plus its id, Timestamps flattened to epoch ms. */
export interface BackupEntry {
  id: string
  date: string
  label: string
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
  mealType: MealType
  source: EntrySource
  flagged?: FlaggableField[]
  createdAtMs: number
  updatedAtMs: number
}

/** A Coverage label as it travels in a backup (ADR 0006), its Timestamp flattened to epoch ms. */
export interface BackupDay {
  day: string
  coverage: CoverageLevel
  updatedAtMs: number
}

/** A whole profile, one versioned file. */
export interface BackupFile {
  format: typeof BACKUP_FORMAT
  /** When the export was taken, epoch ms — informational. */
  exportedAtMs: number
  /** null when onboarding never set a Goal. */
  goal: Goal | null
  entries: BackupEntry[]
  days: BackupDay[]
  overlays: ProductOverlay[]
}

/** A file that isn't a makrofy/2 backup — surfaced to the user as "not a valid backup". */
export class BackupParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BackupParseError"
  }
}

/** The download body: pretty-printed so a curious user can read it. */
export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2)
}

/**
 * Parse and validate a picked file into a BackupFile, throwing BackupParseError
 * on anything that isn't a makrofy/2 backup. Validation guards the envelope (the
 * format tag and the three collections) and each Entry's identifying fields, so
 * a truncated or foreign file is refused before import writes a single doc —
 * rather than trusting the shape blindly. Goal, days and overlays travel as our
 * own exports wrote them.
 */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupParseError("not valid JSON")
  }
  if (raw === null || typeof raw !== "object") {
    throw new BackupParseError("not a backup object")
  }
  const obj = raw as Record<string, unknown>
  if (obj.format !== BACKUP_FORMAT) {
    throw new BackupParseError(`unsupported format: ${String(obj.format)}`)
  }
  if (
    !Array.isArray(obj.entries) ||
    !Array.isArray(obj.days) ||
    !Array.isArray(obj.overlays)
  ) {
    throw new BackupParseError("missing or malformed collections")
  }
  obj.entries.forEach(assertBackupEntry)
  return {
    format: BACKUP_FORMAT,
    exportedAtMs: typeof obj.exportedAtMs === "number" ? obj.exportedAtMs : 0,
    goal: (obj.goal ?? null) as Goal | null,
    entries: obj.entries as BackupEntry[],
    days: obj.days as BackupDay[],
    overlays: obj.overlays as ProductOverlay[],
  }
}

// The identifying fields import writes by: without a string id and numeric
// kcal/timestamps an Entry can't be keyed, counted against duplicates, or
// reconstructed, so a payload carrying one is not a backup we can restore.
function assertBackupEntry(entry: unknown): void {
  const e = entry as Record<string, unknown>
  const ok =
    e !== null &&
    typeof e === "object" &&
    typeof e.id === "string" &&
    typeof e.date === "string" &&
    typeof e.kcal === "number" &&
    typeof e.createdAtMs === "number" &&
    typeof e.updatedAtMs === "number"
  if (!ok) throw new BackupParseError("malformed Entry in backup")
}

/** The import preview's new-vs-duplicate split, by Entry id. */
export interface EntryDiff {
  /** The ids not already in the profile — what import will write. */
  newIds: string[]
  newCount: number
  /** Ids already present; import skips them, never doubling (spec § Export / import). */
  duplicateCount: number
}

/**
 * Split a backup's Entries into new and duplicate against the ids a profile
 * already holds — the preview shown before import, and the same partition
 * import writes by. Pure: the caller supplies the existing ids.
 */
export function diffEntries(
  entries: BackupEntry[],
  existingIds: ReadonlySet<string>,
): EntryDiff {
  const newIds: string[] = []
  let duplicateCount = 0
  for (const entry of entries) {
    if (existingIds.has(entry.id)) duplicateCount += 1
    else newIds.push(entry.id)
  }
  return { newIds, newCount: newIds.length, duplicateCount }
}

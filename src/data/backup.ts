import { collection, getDocs, Timestamp, type Firestore } from "firebase/firestore"

import { readAllDays, writeDays, type DayDoc } from "@/data/days"
import { readAllEntries, writeEntries, type Entry } from "@/data/entries"
import { readGoal, setGoal } from "@/data/goal"
import { readAllOverlays, writeOverlays } from "@/data/products"
import {
  BACKUP_FORMAT,
  diffEntries,
  type BackupDay,
  type BackupEntry,
  type BackupFile,
} from "@/lib/backup"

// The export/import data layer (spec § Export / import, issue #24). Export reads
// every user-authored collection — Entries (ADR 0003), Goal, the Coverage days
// sidecar (ADR 0006) and the Glossary curation overlay (ADR 0009) — into one
// yaffle/2 file. Import writes it back through the normal module functions, so
// the same listeners feed sync, typeahead and stats with no special-casing. The
// pure shape and its validation live in src/lib/backup.ts; this layer only adds
// Firestore I/O and the Timestamp ↔ epoch-ms conversion at the boundary.

/**
 * Gather a whole profile into a yaffle/2 file. Reads the four collections
 * concurrently and flattens each Entry's and Day's Firestore Timestamps to
 * epoch ms (the overlay already stores plain ms). `exportedAtMs` is stamped by
 * the caller — the module never reads the clock.
 */
export async function exportBackup(
  db: Firestore,
  uid: string,
  exportedAtMs: number,
): Promise<BackupFile> {
  const [entries, goal, days, overlays] = await Promise.all([
    readAllEntries(db, uid),
    readGoal(db, uid),
    readAllDays(db, uid),
    readAllOverlays(db, uid),
  ])
  return {
    format: BACKUP_FORMAT,
    exportedAtMs,
    goal,
    entries: entries.map(entryToBackup),
    days: days.map(dayToBackup),
    overlays: [...overlays],
  }
}

/** The new-vs-duplicate split (by Entry id) plus the collection sizes an import will restore. */
export interface ImportPreview {
  newEntries: number
  duplicateEntries: number
  days: number
  overlays: number
  hasGoal: boolean
}

/**
 * What importing `file` into this profile would do, without writing anything —
 * the preview shown before the user confirms (spec § Export / import). Entries
 * split new vs duplicate by id against what the profile already holds; the other
 * collections restore wholesale.
 */
export async function previewImport(
  db: Firestore,
  uid: string,
  file: BackupFile,
): Promise<ImportPreview> {
  const diff = diffEntries(file.entries, await existingEntryIds(db, uid))
  return {
    newEntries: diff.newCount,
    duplicateEntries: diff.duplicateCount,
    days: file.days.length,
    overlays: file.overlays.length,
    hasGoal: file.goal !== null,
  }
}

/** What an import actually wrote. */
export interface ImportResult {
  importedEntries: number
  skippedEntries: number
  days: number
  overlays: number
  goalRestored: boolean
}

/**
 * Restore `file` into this profile. Entries union by id — only ids the profile
 * lacks are written, so a re-import never doubles and a locally-edited duplicate
 * is kept untouched. The Goal, Coverage labels and overlays are a deliberate
 * restore: incoming wins (setGoal replaces, writeDays / writeOverlays
 * overwrite). Writing through the normal modules means the live listeners pick
 * everything up for free.
 */
export async function importBackup(
  db: Firestore,
  uid: string,
  file: BackupFile,
): Promise<ImportResult> {
  const diff = diffEntries(file.entries, await existingEntryIds(db, uid))
  const isNew = new Set(diff.newIds)
  const newEntries = file.entries
    .filter((entry) => isNew.has(entry.id))
    .map(backupToEntry)

  await writeEntries(db, uid, newEntries)
  await writeDays(db, uid, file.days.map(backupToDay))
  await writeOverlays(db, uid, file.overlays)
  if (file.goal !== null) setGoal(db, uid, file.goal)

  return {
    importedEntries: newEntries.length,
    skippedEntries: diff.duplicateCount,
    days: file.days.length,
    overlays: file.overlays.length,
    goalRestored: file.goal !== null,
  }
}

/** The ids of every Entry the profile already holds — what duplicates are counted against. */
async function existingEntryIds(
  db: Firestore,
  uid: string,
): Promise<Set<string>> {
  const snap = await getDocs(collection(db, "users", uid, "entries"))
  return new Set(snap.docs.map((d) => d.id))
}

// Undefined optionals are dropped so a copy carries only the fields the Entry
// actually stored, mirroring how it was written (assignPresentMacros).
function entryToBackup(entry: Entry): BackupEntry {
  const out: BackupEntry = {
    id: entry.id,
    date: entry.date,
    label: entry.label,
    kcal: entry.kcal,
    mealType: entry.mealType,
    source: entry.source,
    createdAtMs: entry.createdAt.toMillis(),
    updatedAtMs: entry.updatedAt.toMillis(),
  }
  if (entry.protein !== undefined) out.protein = entry.protein
  if (entry.fat !== undefined) out.fat = entry.fat
  if (entry.carbs !== undefined) out.carbs = entry.carbs
  if (entry.flagged !== undefined) out.flagged = entry.flagged
  return out
}

function backupToEntry(backup: BackupEntry): Entry {
  const entry: Entry = {
    id: backup.id,
    date: backup.date,
    label: backup.label,
    kcal: backup.kcal,
    mealType: backup.mealType,
    source: backup.source,
    createdAt: Timestamp.fromMillis(backup.createdAtMs),
    updatedAt: Timestamp.fromMillis(backup.updatedAtMs),
  }
  if (backup.protein !== undefined) entry.protein = backup.protein
  if (backup.fat !== undefined) entry.fat = backup.fat
  if (backup.carbs !== undefined) entry.carbs = backup.carbs
  if (backup.flagged !== undefined) entry.flagged = backup.flagged
  return entry
}

function dayToBackup(day: DayDoc): BackupDay {
  return {
    day: day.day,
    coverage: day.coverage,
    updatedAtMs: day.updatedAt.toMillis(),
  }
}

function backupToDay(backup: BackupDay): DayDoc {
  return {
    day: backup.day,
    coverage: backup.coverage,
    updatedAt: Timestamp.fromMillis(backup.updatedAtMs),
  }
}

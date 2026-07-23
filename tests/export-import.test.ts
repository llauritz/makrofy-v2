// Seam: the export/import data layer (src/data/backup.ts) — the whole-profile
// round-trip of spec § Export / import (issue #24). Export reads every
// collection into a yaffle/2 file; import writes it back through the normal
// modules so sync, typeahead and stats pick it up. The acceptance is here:
// export → wipe → import restores every field losslessly (to the millisecond,
// the format's Timestamp precision), duplicates are skipped not doubled, and an
// import is a deliberate restore so incoming wins for the Goal, days and
// overlays.
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Timestamp, waitForPendingWrites } from "firebase/firestore"

import { exportBackup, importBackup, previewImport } from "@/data/backup"
import { readAllDays, setCoverage, type DayDoc } from "@/data/days"
import {
  readAllEntries,
  writeEntries,
  type Entry,
} from "@/data/entries"
import { readGoal, setGoal } from "@/data/goal"
import { readAllOverlays, setPin, writeMissingOverlays } from "@/data/products"
import { ensureIdentity } from "@/data/identity"
import type { ProductOverlay } from "@/lib/suggestions"
import {
  clearFirestoreData,
  createEmulatorApp,
  destroyEmulatorApp,
  type EmulatorApp,
} from "./emulator"

let ctx: EmulatorApp
let uid: string

beforeEach(async () => {
  await clearFirestoreData()
  ctx = createEmulatorApp()
  uid = (await ensureIdentity(ctx.auth)).uid
})

afterEach(async () => {
  await destroyEmulatorApp(ctx)
})

// Entries built by hand so every ADR 0003 field is controlled and deterministic:
// macros present and absent, flags present and absent, all three sources, a
// derived mealType and an 'unknown' one.
const seedEntries: Entry[] = [
  {
    id: "e1",
    date: "2026-07-11",
    label: "eggs",
    kcal: 180,
    protein: 12,
    fat: 10,
    carbs: 1,
    mealType: "breakfast",
    source: "manual",
    flagged: ["fat"],
    createdAt: Timestamp.fromMillis(1_700_000_100_000),
    updatedAt: Timestamp.fromMillis(1_700_000_150_000),
  },
  {
    id: "e2",
    date: "2026-07-12",
    label: "toast",
    kcal: 90,
    mealType: "unknown",
    source: "history",
    createdAt: Timestamp.fromMillis(1_700_000_200_000),
    updatedAt: Timestamp.fromMillis(1_700_000_200_000),
  },
  {
    id: "e3",
    date: "2026-07-12",
    label: "chicken",
    kcal: 250,
    protein: 40,
    mealType: "lunch",
    source: "ai",
    flagged: ["kcal", "carbs"],
    createdAt: Timestamp.fromMillis(1_700_000_300_000),
    updatedAt: Timestamp.fromMillis(1_700_000_350_000),
  },
]

const seedOverlay: ProductOverlay = {
  key: "mass:peanut butter",
  edits: [{ from: 5.9, rate: { kcal: 6, protein: 0.25 }, atMs: 1_700_000_400_000 }],
  pinnedRate: 6,
  aliases: [{ key: "mass:pb", label: "pb", atMs: 1_700_000_500_000 }],
}

// Entries compared to the millisecond — the backup format carries Timestamps as
// epoch ms, so a round-trip is lossless at ms precision.
function comparableEntry(entry: Entry) {
  return {
    id: entry.id,
    date: entry.date,
    label: entry.label,
    kcal: entry.kcal,
    protein: entry.protein,
    fat: entry.fat,
    carbs: entry.carbs,
    mealType: entry.mealType,
    source: entry.source,
    flagged: entry.flagged,
    createdAtMs: entry.createdAt.toMillis(),
    updatedAtMs: entry.updatedAt.toMillis(),
  }
}

const byEntryId = (entries: Entry[]) =>
  [...entries].map(comparableEntry).sort((a, b) => a.id.localeCompare(b.id))

const byDay = (days: DayDoc[]) =>
  [...days]
    .map((d) => ({ day: d.day, coverage: d.coverage, updatedAtMs: d.updatedAt.toMillis() }))
    .sort((a, b) => a.day.localeCompare(b.day))

async function seedWholeProfile(): Promise<void> {
  await writeEntries(ctx.db, uid, seedEntries)
  setGoal(ctx.db, uid, { kcal: 2100, protein: 150 })
  setCoverage(ctx.db, uid, "2026-07-11", "most")
  setCoverage(ctx.db, uid, "2026-07-12", "everything")
  await writeMissingOverlays(ctx.db, uid, [seedOverlay])
  await waitForPendingWrites(ctx.db)
}

describe("export gathers the whole profile as yaffle/2", () => {
  it("carries every collection and the format tag", async () => {
    await seedWholeProfile()

    const file = await exportBackup(ctx.db, uid, 1_700_009_999_000)

    expect(file.format).toBe("yaffle/2")
    expect(file.exportedAtMs).toBe(1_700_009_999_000)
    expect(file.goal).toEqual({ kcal: 2100, protein: 150 })
    expect(file.entries).toHaveLength(3)
    expect(file.days).toHaveLength(2)
    expect(file.overlays).toEqual([seedOverlay])
  })

  it("flattens an Entry's Timestamps to epoch ms", async () => {
    await seedWholeProfile()
    const file = await exportBackup(ctx.db, uid, 0)
    const e1 = file.entries.find((e) => e.id === "e1")!
    expect(e1.createdAtMs).toBe(1_700_000_100_000)
    expect(e1.updatedAtMs).toBe(1_700_000_150_000)
    expect(e1.flagged).toEqual(["fat"])
    expect(e1.mealType).toBe("breakfast")
  })
})

describe("export → wipe → import round-trips a whole profile losslessly", () => {
  it("restores every Entry field, the Goal, Coverage labels and overlays", async () => {
    await seedWholeProfile()
    const before = {
      entries: byEntryId(await readAllEntries(ctx.db, uid)),
      goal: await readGoal(ctx.db, uid),
      days: byDay(await readAllDays(ctx.db, uid)),
      overlays: await readAllOverlays(ctx.db, uid),
    }

    const file = await exportBackup(ctx.db, uid, 0)
    await clearFirestoreData()
    const result = await importBackup(ctx.db, uid, file)
    await waitForPendingWrites(ctx.db)

    expect(result.importedEntries).toBe(3)
    expect(result.skippedEntries).toBe(0)
    expect(result.days).toBe(2)
    expect(result.overlays).toBe(1)
    expect(result.goalRestored).toBe(true)

    expect(byEntryId(await readAllEntries(ctx.db, uid))).toEqual(before.entries)
    expect(await readGoal(ctx.db, uid)).toEqual(before.goal)
    expect(byDay(await readAllDays(ctx.db, uid))).toEqual(before.days)
    expect(await readAllOverlays(ctx.db, uid)).toEqual(before.overlays)
  })
})

describe("the import preview counts new vs duplicate Entries by id", () => {
  it("counts everything new against an empty profile", async () => {
    await seedWholeProfile()
    const file = await exportBackup(ctx.db, uid, 0)
    await clearFirestoreData()

    const preview = await previewImport(ctx.db, uid, file)
    expect(preview).toEqual({
      newEntries: 3,
      duplicateEntries: 0,
      days: 2,
      overlays: 1,
      hasGoal: true,
    })
  })

  it("counts an Entry already present as a duplicate", async () => {
    await seedWholeProfile()
    const file = await exportBackup(ctx.db, uid, 0)
    // Leave e1 in place, drop the rest.
    await clearFirestoreData()
    await writeEntries(ctx.db, uid, [seedEntries[0]])
    await waitForPendingWrites(ctx.db)

    const preview = await previewImport(ctx.db, uid, file)
    expect(preview.newEntries).toBe(2)
    expect(preview.duplicateEntries).toBe(1)
  })
})

describe("importing is idempotent — duplicates are skipped, not doubled", () => {
  it("re-importing the same file writes nothing the second time", async () => {
    await seedWholeProfile()
    const file = await exportBackup(ctx.db, uid, 0)

    const second = await importBackup(ctx.db, uid, file)
    await waitForPendingWrites(ctx.db)

    expect(second.importedEntries).toBe(0)
    expect(second.skippedEntries).toBe(3)
    expect(await readAllEntries(ctx.db, uid)).toHaveLength(3)
  })

  it("keeps a locally-edited Entry over the backed-up copy of the same id", async () => {
    await seedWholeProfile()
    const file = await exportBackup(ctx.db, uid, 0)

    // The local e1 now differs from the backup's e1 — a duplicate id must be
    // left as the local copy, never overwritten.
    const editedE1: Entry = { ...seedEntries[0], kcal: 999, label: "eggs (edited)" }
    await writeEntries(ctx.db, uid, [editedE1])
    await waitForPendingWrites(ctx.db)

    await importBackup(ctx.db, uid, file)
    await waitForPendingWrites(ctx.db)

    const after = await readAllEntries(ctx.db, uid)
    const e1 = after.find((e) => e.id === "e1")!
    expect(e1.kcal).toBe(999)
    expect(e1.label).toBe("eggs (edited)")
  })
})

describe("an import is a deliberate restore — incoming wins for Goal, days, overlays", () => {
  it("overwrites an existing overlay, Coverage label and Goal with the backup's", async () => {
    await seedWholeProfile()
    const file = await exportBackup(ctx.db, uid, 0)

    // Diverge every singleton-ish record locally, then import the backup.
    setGoal(ctx.db, uid, { kcal: 1500 })
    setCoverage(ctx.db, uid, "2026-07-11", "some")
    setPin(ctx.db, uid, seedOverlay.key, 99) // repins the overlay to a different Rate
    await waitForPendingWrites(ctx.db)

    await importBackup(ctx.db, uid, file)
    await waitForPendingWrites(ctx.db)

    expect(await readGoal(ctx.db, uid)).toEqual({ kcal: 2100, protein: 150 })
    const days = new Map((await readAllDays(ctx.db, uid)).map((d) => [d.day, d.coverage]))
    expect(days.get("2026-07-11")).toBe("most")
    expect(await readAllOverlays(ctx.db, uid)).toEqual([seedOverlay])
  })
})

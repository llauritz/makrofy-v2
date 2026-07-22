// Seam: the backup format core (src/lib/backup.ts) — the pure JSON shape of a
// makrofy/2 export and its validating parse. Firestore-free, so tested without
// the emulator: the data-layer round-trip against a real profile lives in
// export-import.test.ts. Two things matter and are cheap to get wrong: a file
// survives serialize → parse unchanged, and parse rejects anything that isn't a
// makrofy/2 backup rather than writing garbage on import.
import { describe, expect, it } from "vitest"

import {
  BACKUP_FORMAT,
  BackupParseError,
  diffEntries,
  parseBackup,
  serializeBackup,
  type BackupEntry,
  type BackupFile,
} from "@/lib/backup"

function sampleFile(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    format: BACKUP_FORMAT,
    exportedAtMs: 1_700_000_000_000,
    goal: { kcal: 2100, protein: 150 },
    entries: [
      {
        id: "a1",
        date: "2026-07-11",
        label: "eggs",
        kcal: 180,
        protein: 12,
        mealType: "breakfast",
        source: "manual",
        flagged: ["fat"],
        createdAtMs: 1_700_000_100_000,
        updatedAtMs: 1_700_000_200_000,
      },
      {
        id: "b2",
        date: "2026-07-12",
        label: "toast",
        kcal: 90,
        mealType: "unknown",
        source: "history",
        createdAtMs: 1_700_000_300_000,
        updatedAtMs: 1_700_000_300_000,
      },
    ],
    days: [{ day: "2026-07-11", coverage: "most", updatedAtMs: 1_700_000_400_000 }],
    overlays: [{ key: "mass:peanut butter", pinnedRate: 5.9 }],
    ...overrides,
  }
}

describe("serialize / parse round-trip", () => {
  it("survives serialize → parse unchanged, every field intact", () => {
    const file = sampleFile()
    expect(parseBackup(serializeBackup(file))).toEqual(file)
  })

  it("tags the payload as makrofy/2", () => {
    expect(JSON.parse(serializeBackup(sampleFile())).format).toBe("makrofy/2")
  })

  it("preserves a null goal and empty collections", () => {
    const empty = sampleFile({ goal: null, entries: [], days: [], overlays: [] })
    expect(parseBackup(serializeBackup(empty))).toEqual(empty)
  })
})

describe("parse rejects anything that isn't a makrofy/2 backup", () => {
  it("rejects non-JSON text", () => {
    expect(() => parseBackup("not json {")).toThrow(BackupParseError)
  })

  it("rejects a JSON value that isn't an object", () => {
    expect(() => parseBackup("42")).toThrow(BackupParseError)
    expect(() => parseBackup("null")).toThrow(BackupParseError)
  })

  it("rejects a foreign or absent format tag — V2 speaks only its own format", () => {
    expect(() => parseBackup(JSON.stringify({ format: "makrofy/1", entries: [] }))).toThrow(
      BackupParseError,
    )
    expect(() => parseBackup(JSON.stringify({ entries: [], days: [], overlays: [] }))).toThrow(
      BackupParseError,
    )
  })

  it("rejects a makrofy/2 payload whose collections are missing or malformed", () => {
    expect(() => parseBackup(JSON.stringify({ format: BACKUP_FORMAT }))).toThrow(BackupParseError)
    expect(() =>
      parseBackup(JSON.stringify({ format: BACKUP_FORMAT, entries: {}, days: [], overlays: [] })),
    ).toThrow(BackupParseError)
  })

  it("rejects an entry missing its id or numbers, so import never writes a broken Entry", () => {
    const broken = {
      format: BACKUP_FORMAT,
      exportedAtMs: 0,
      goal: null,
      entries: [{ date: "2026-07-11", label: "eggs", kcal: 180 }],
      days: [],
      overlays: [],
    }
    expect(() => parseBackup(JSON.stringify(broken))).toThrow(BackupParseError)
  })
})

describe("diffEntries — the import preview's new-vs-duplicate count by Entry id", () => {
  const entries: BackupEntry[] = sampleFile().entries

  it("counts every entry new against an empty profile", () => {
    const diff = diffEntries(entries, new Set())
    expect(diff.newCount).toBe(2)
    expect(diff.duplicateCount).toBe(0)
    expect(diff.newIds).toEqual(["a1", "b2"])
  })

  it("counts an id already present as a duplicate, not new", () => {
    const diff = diffEntries(entries, new Set(["a1"]))
    expect(diff.newCount).toBe(1)
    expect(diff.duplicateCount).toBe(1)
    expect(diff.newIds).toEqual(["b2"])
  })
})

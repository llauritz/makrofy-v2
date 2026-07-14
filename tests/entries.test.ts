// Seam: the entries module — the only way Entries are written, deleted, and
// observed (ADR 0003; CONTEXT.md for Entry / Day / Backfill / Meal type).
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  doc,
  onSnapshot,
  Timestamp,
  waitForPendingWrites,
  type DocumentData,
} from "firebase/firestore"
import {
  addEntry,
  deleteEntry,
  deriveMealType,
  listenToAllEntries,
  listenToDay,
  readAllEntries,
  updateEntry,
  writeEntries,
  type Entry,
} from "@/data/entries"
import { ensureIdentity } from "@/data/identity"
import {
  clearFirestoreData,
  createEmulatorApp,
  destroyEmulatorApp,
  waitFor,
  type EmulatorApp,
} from "./emulator"

const at = (hour: number, minute = 0) => new Date(2026, 6, 11, hour, minute)

// Independent of the module's own date helpers on purpose.
const todayLocal = () => new Date().toLocaleDateString("en-CA")

// The Day listener never sees a server timestamp resolve (it isn't watching
// metadata) and estimates them sub-second while a write is pending, so it
// can't be used to compare timestamps across a write. This reads the
// server-confirmed state — no pending writes, not from cache — where every
// server timestamp has settled to its real (whole-second, in the emulator)
// value.
function waitForServerEntry(
  ctx: EmulatorApp,
  uid: string,
  id: string,
  match: (data: DocumentData) => boolean = () => true,
): Promise<DocumentData> {
  const ref = doc(ctx.db, "users", uid, "entries", id)
  return new Promise((resolve) => {
    const unsub = onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
      const data = snap.data()
      if (
        data &&
        !snap.metadata.hasPendingWrites &&
        !snap.metadata.fromCache &&
        match(data)
      ) {
        unsub()
        resolve(data)
      }
    })
  })
}

describe("deriveMealType", () => {
  it("maps the local clock onto meal windows", () => {
    expect(deriveMealType(at(4))).toBe("breakfast")
    expect(deriveMealType(at(10, 59))).toBe("breakfast")
    expect(deriveMealType(at(11))).toBe("lunch")
    expect(deriveMealType(at(14, 59))).toBe("lunch")
    expect(deriveMealType(at(15))).toBe("snack")
    expect(deriveMealType(at(16, 59))).toBe("snack")
    expect(deriveMealType(at(17))).toBe("dinner")
    expect(deriveMealType(at(21, 59))).toBe("dinner")
    expect(deriveMealType(at(22))).toBe("snack")
    expect(deriveMealType(at(3, 59))).toBe("snack")
  })
})

describe("logging and observing a Day", () => {
  let ctx: EmulatorApp
  let uid: string
  let stops: Array<() => void>

  beforeEach(async () => {
    await clearFirestoreData()
    ctx = createEmulatorApp()
    uid = (await ensureIdentity(ctx.auth)).uid
    stops = []
  })

  afterEach(async () => {
    stops.forEach((stop) => stop())
    await destroyEmulatorApp(ctx)
  })

  const observeDay = (day: string) => {
    const states: Entry[][] = []
    stops.push(listenToDay(ctx.db, uid, day, (entries) => states.push(entries)))
    return states
  }

  it("logging on today derives the meal type from the clock", async () => {
    const today = todayLocal()
    const id = await addEntry(ctx.db, uid, {
      date: today,
      label: "porridge",
      kcal: 320,
      source: "manual",
    })

    const states = observeDay(today)
    const entries = await waitFor(() => states.find((s) => s.length === 1))
    expect(entries[0]).toMatchObject({
      id,
      date: today,
      label: "porridge",
      kcal: 320,
      source: "manual",
    })
    expect(entries[0].mealType).not.toBe("unknown")
    expect(entries[0].createdAt).toBeInstanceOf(Timestamp)
    expect(entries[0].updatedAt).toBeInstanceOf(Timestamp)
  })

  it("Backfill stores meal type 'unknown'", async () => {
    await addEntry(ctx.db, uid, {
      date: "2026-01-05",
      label: "leftover stew",
      kcal: 540,
      source: "manual",
    })

    const states = observeDay("2026-01-05")
    const entries = await waitFor(() => states.find((s) => s.length === 1))
    expect(entries[0].mealType).toBe("unknown")
  })

  it("keeps optional macros and flags exactly as committed — absent stays absent", async () => {
    const today = todayLocal()
    await addEntry(ctx.db, uid, {
      date: today,
      label: "protein shake",
      kcal: 220,
      protein: 30,
      source: "ai",
      flagged: ["protein"],
    })

    const states = observeDay(today)
    const entries = await waitFor(() => states.find((s) => s.length === 1))
    expect(entries[0]).toMatchObject({ protein: 30, source: "ai", flagged: ["protein"] })
    expect("fat" in entries[0]).toBe(false)
    expect("carbs" in entries[0]).toBe(false)
  })

  it("a Day listener sees only its own Day, in log order", async () => {
    const today = todayLocal()
    const states = observeDay(today)

    // The emulator truncates server timestamps to whole seconds (production
    // is microsecond-precision), so the adds must straddle a second boundary
    // for their log order to be defined.
    await addEntry(ctx.db, uid, { date: today, label: "first", kcal: 100, source: "manual" })
    await waitFor(() => states.find((s) => s.length === 1))
    await new Promise((r) => setTimeout(r, 1100))
    await addEntry(ctx.db, uid, { date: today, label: "second", kcal: 200, source: "manual" })
    await addEntry(ctx.db, uid, { date: "2026-01-05", label: "other day", kcal: 300, source: "manual" })

    const entries = await waitFor(() => states.find((s) => s.length === 2))
    expect(entries.map((e) => e.label)).toEqual(["first", "second"])
  })

  it("the full-history listener spans Days and stays live", async () => {
    await addEntry(ctx.db, uid, { date: "2026-01-05", label: "past", kcal: 100, source: "manual" })
    await addEntry(ctx.db, uid, { date: todayLocal(), label: "present", kcal: 200, source: "manual" })

    const states: Entry[][] = []
    stops.push(listenToAllEntries(ctx.db, uid, (entries) => states.push(entries)))
    const all = await waitFor(() => states.find((s) => s.length === 2))
    expect(all.map((e) => e.label).sort()).toEqual(["past", "present"])

    await addEntry(ctx.db, uid, { date: "2026-03-20", label: "another", kcal: 300, source: "history" })
    await waitFor(() => states.find((s) => s.length === 3))
  })

  it("deleting an Entry removes it from the log", async () => {
    const today = todayLocal()
    const id = await addEntry(ctx.db, uid, {
      date: today,
      label: "logged twice by mistake",
      kcal: 480,
      source: "history",
    })

    const states = observeDay(today)
    await waitFor(() => states.find((s) => s.length === 1))
    await deleteEntry(ctx.db, uid, id)
    await waitFor(() => {
      const latest = states[states.length - 1]
      return latest.length === 0 ? latest : undefined
    })
  })

  it("editing an Entry rewrites its mutable fields, keeping its identity", async () => {
    const today = todayLocal()
    const id = await addEntry(ctx.db, uid, {
      date: today,
      label: "porrige", // typo to fix
      kcal: 300,
      source: "manual",
    })

    // First appearance in the log, then the server-confirmed createdAt.
    const states = observeDay(today)
    await waitFor(() => states.find((s) => s.length === 1))
    const before = await waitForServerEntry(ctx, uid, id)
    const createdAtMs = (before.createdAt as Timestamp).toMillis()

    // Straddle a second boundary so a regression that restamped createdAt would
    // land on a later second and be caught.
    await new Promise((r) => setTimeout(r, 1100))
    updateEntry(ctx.db, uid, id, { label: "porridge", kcal: 320, protein: 12 })

    const after = await waitForServerEntry(
      ctx,
      uid,
      id,
      (d) => d.label === "porridge",
    )
    expect(after).toMatchObject({
      date: today, // untouched
      label: "porridge",
      kcal: 320,
      protein: 12,
      source: "manual", // untouched
    })
    // createdAt is preserved; updatedAt advances to the edit.
    expect((after.createdAt as Timestamp).toMillis()).toBe(createdAtMs)
    expect((after.updatedAt as Timestamp).toMillis()).toBeGreaterThan(
      createdAtMs,
    )
  })

  it("editing clears macros that were removed and adds ones that appear", async () => {
    const today = todayLocal()
    const id = await addEntry(ctx.db, uid, {
      date: today,
      label: "mixed plate",
      kcal: 500,
      protein: 30,
      fat: 20,
      source: "manual",
    })

    const states = observeDay(today)
    await waitFor(() => states.find((s) => s[0]?.protein === 30))

    // Drop fat, keep protein, introduce carbs.
    await updateEntry(ctx.db, uid, id, {
      label: "mixed plate",
      kcal: 500,
      protein: 30,
      carbs: 45,
    })

    const after = await waitFor(() =>
      states.find((s) => s[0] && "carbs" in s[0]),
    )
    expect(after[0]).toMatchObject({ protein: 30, carbs: 45 })
    expect("fat" in after[0]).toBe(false)
  })
})

// The one-shot read and id-preserving batch write that back the union merge
// (ADR 0002, #19): a Guest's whole history is read while still signed in as the
// Guest, then written into the account it's merging into.
describe("reading and copying whole Entries", () => {
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

  it("reads the whole history in one shot, ids and timestamps intact", async () => {
    addEntry(ctx.db, uid, { date: "2026-07-11", label: "eggs", kcal: 180, source: "manual" })
    addEntry(ctx.db, uid, { date: "2026-07-12", label: "toast", kcal: 90, source: "history" })
    await waitForPendingWrites(ctx.db)

    const entries = await readAllEntries(ctx.db, uid)
    expect(entries.map((e) => e.label).sort()).toEqual(["eggs", "toast"])
    expect(entries.every((e) => e.createdAt instanceof Timestamp)).toBe(true)
    expect(entries.every((e) => typeof e.id === "string" && e.id.length > 0)).toBe(true)
  })

  it("re-writing the same Entries preserves ids and never duplicates", async () => {
    // Copy is id-preserving, so an interrupted-then-retried merge lands the same
    // documents rather than duplicating them — the union stays clean.
    addEntry(ctx.db, uid, { date: "2026-07-11", label: "porridge", kcal: 320, source: "manual" })
    await waitForPendingWrites(ctx.db)
    const held = await readAllEntries(ctx.db, uid)

    await writeEntries(ctx.db, uid, held)
    await writeEntries(ctx.db, uid, held)

    const after = await readAllEntries(ctx.db, uid)
    expect(after).toHaveLength(1)
    expect(after.map((e) => e.id)).toEqual(held.map((e) => e.id))
  })

  it("writing an empty set is a no-op", async () => {
    await writeEntries(ctx.db, uid, [])
    expect(await readAllEntries(ctx.db, uid)).toEqual([])
  })
})

// Seam: the days module — the per-Day metadata sidecar (ADR 0006; CONTEXT.md
// for Coverage / Day). The only way Coverage is written, cleared, and observed.
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Timestamp, waitForPendingWrites } from "firebase/firestore"
import {
  clearCoverage,
  listenToCoverage,
  listenToCoverageInRange,
  readAllDays,
  setCoverage,
  writeMissingDays,
  type CoverageLevel,
  type CoverageMap,
} from "@/data/days"
import { ensureIdentity } from "@/data/identity"
import {
  clearFirestoreData,
  createEmulatorApp,
  destroyEmulatorApp,
  waitFor,
  type EmulatorApp,
} from "./emulator"

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

const observeCoverage = (day: string) => {
  const states: Array<CoverageLevel | null> = []
  stops.push(listenToCoverage(ctx.db, uid, day, (level) => states.push(level)))
  return states
}

describe("labelling a Day's Coverage", () => {
  it("reads null for an unlabelled Day — absence means no metadata", async () => {
    const states = observeCoverage("2026-07-11")
    const first = await waitFor(() => (states.length > 0 ? states : undefined))
    expect(first[0]).toBeNull()
  })

  it("round-trips a label and re-labels freely — the last set wins", async () => {
    const states = observeCoverage("2026-07-11")

    setCoverage(ctx.db, uid, "2026-07-11", "some")
    await waitFor(() => states.find((level) => level === "some"))

    setCoverage(ctx.db, uid, "2026-07-11", "everything")
    await waitFor(() => states.find((level) => level === "everything"))
  })

  it("removing a label deletes the doc — back to the trusted default", async () => {
    const states = observeCoverage("2026-07-11")
    setCoverage(ctx.db, uid, "2026-07-11", "most")
    await waitFor(() => states.find((level) => level === "most"))

    clearCoverage(ctx.db, uid, "2026-07-11")
    await waitFor(() => {
      const latest = states[states.length - 1]
      return latest === null ? states : undefined
    })
  })
})

// The stats feed (#22): every label inside a date window, keyed by Day.
describe("observing Coverage over a range", () => {
  const observeRange = (start: string, end: string) => {
    const states: CoverageMap[] = []
    stops.push(
      listenToCoverageInRange(ctx.db, uid, start, end, (map) =>
        states.push(map),
      ),
    )
    return states
  }

  it("sees only labels inside the window, keyed by Day, and stays live", async () => {
    setCoverage(ctx.db, uid, "2026-07-06", "some")
    setCoverage(ctx.db, uid, "2026-07-12", "most")
    setCoverage(ctx.db, uid, "2026-07-05", "everything") // day before the window
    setCoverage(ctx.db, uid, "2026-07-13", "some") // day after the window
    await waitForPendingWrites(ctx.db)

    const states = observeRange("2026-07-06", "2026-07-12")
    const initial = await waitFor(() => states.find((m) => m.size === 2))
    expect(initial.get("2026-07-06")).toBe("some")
    expect(initial.get("2026-07-12")).toBe("most")

    // A fresh label inside the window arrives…
    setCoverage(ctx.db, uid, "2026-07-09", "everything")
    await waitFor(() =>
      states.find((m) => m.get("2026-07-09") === "everything"),
    )

    // …and a cleared one falls out.
    clearCoverage(ctx.db, uid, "2026-07-06")
    await waitFor(() =>
      states.find((m) => m.size === 2 && !m.has("2026-07-06")),
    )
  })
})

// The union merge's halves (ADR 0002/0006): a Guest's labels are read whole,
// then written into the existing account — which wins any date both hold.
describe("reading and copying whole days docs", () => {
  it("reads every labelled Day in one shot, timestamps intact", async () => {
    setCoverage(ctx.db, uid, "2026-07-10", "some")
    setCoverage(ctx.db, uid, "2026-07-11", "everything")
    await waitForPendingWrites(ctx.db)

    const days = await readAllDays(ctx.db, uid)
    expect(days.map((d) => [d.day, d.coverage]).sort()).toEqual([
      ["2026-07-10", "some"],
      ["2026-07-11", "everything"],
    ])
    expect(days.every((d) => d.updatedAt instanceof Timestamp)).toBe(true)
  })

  it("writes only the dates the destination lacks — the existing label wins", async () => {
    setCoverage(ctx.db, uid, "2026-07-10", "everything")
    await waitForPendingWrites(ctx.db)
    const existing = await readAllDays(ctx.db, uid)

    await writeMissingDays(ctx.db, uid, [
      { day: "2026-07-10", coverage: "some", updatedAt: existing[0].updatedAt },
      { day: "2026-07-12", coverage: "most", updatedAt: existing[0].updatedAt },
    ])

    const after = await readAllDays(ctx.db, uid)
    const byDay = new Map(after.map((d) => [d.day, d.coverage]))
    expect(byDay.get("2026-07-10")).toBe("everything") // collision: untouched
    expect(byDay.get("2026-07-12")).toBe("most") // unique: lands
  })

  it("writing an empty set is a no-op", async () => {
    await writeMissingDays(ctx.db, uid, [])
    expect(await readAllDays(ctx.db, uid)).toEqual([])
  })
})

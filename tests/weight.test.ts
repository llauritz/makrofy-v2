// Seam: Health Connect weigh-ins shaped for the stats tile (ADR 0014).
import { describe, expect, it } from "vitest"

import { roundKg, weightSummary } from "@/lib/weight"

const at = (day: number, hour = 8) => new Date(2026, 10, day, hour).getTime()

describe("weightSummary", () => {
  it("is null with no weigh-in in the window", () => {
    expect(weightSummary([], "2026-11-20")).toBeNull()
    expect(
      weightSummary([{ timeMs: at(1) - 40 * 86_400_000, kg: 80 }], "2026-11-20")
    ).toBeNull()
  })

  it("reports the latest weigh-in and the change across the window", () => {
    const summary = weightSummary(
      [
        { timeMs: at(18), kg: 79.2 },
        { timeMs: at(2), kg: 80.4 },
        { timeMs: at(10), kg: 79.9 },
      ],
      "2026-11-20"
    )
    expect(summary?.latest).toEqual({ timeMs: at(18), kg: 79.2 })
    expect(roundKg(summary!.change!)).toBe(-1.2)
  })

  it("has no change with a single weigh-in", () => {
    expect(
      weightSummary([{ timeMs: at(5), kg: 80 }], "2026-11-20")?.change
    ).toBeNull()
  })

  it("keeps each Day's last weigh-in and leaves gaps elsewhere", () => {
    const summary = weightSummary(
      [
        { timeMs: at(20, 7), kg: 80.0 },
        { timeMs: at(20, 21), kg: 80.6 },
        { timeMs: at(18), kg: 79.5 },
      ],
      "2026-11-20",
      3
    )
    expect(summary?.daily).toEqual([79.5, null, 80.6])
  })
})

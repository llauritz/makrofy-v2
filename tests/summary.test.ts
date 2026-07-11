// Seam: the summary math behind the floating card (src/screens/main/summary.ts).
// The ring, "Remaining: N" / "Over: N", % of Goal and the macro pills all read
// from one pure reduction — kept independent so the NaN/divide-by-zero and
// decimal-truncation edges V1 got wrong (spec § V1 failure classes) are pinned.
import { describe, expect, it } from "vitest"
import { summarize } from "@/screens/main/summary"

// Minimal nutrient rows; summarize only reads kcal + the optional macros.
const row = (kcal: number, protein?: number, fat?: number, carbs?: number) => ({
  kcal,
  protein,
  fat,
  carbs,
})

describe("summarize", () => {
  it("reports an empty Day as nothing consumed, all of the Goal remaining", () => {
    const s = summarize([], 2000)
    expect(s).toMatchObject({
      consumed: 0,
      goalKcal: 2000,
      remaining: 2000,
      over: 0,
      isOver: false,
      pctOfGoal: 0,
    })
    expect(s.totals).toEqual({ protein: 0, fat: 0, carbs: 0 })
  })

  it("sums kcal and reports what's left when under the Goal", () => {
    const s = summarize([row(320), row(540), row(150)], 2000) // 1010
    expect(s.consumed).toBe(1010)
    expect(s.remaining).toBe(990)
    expect(s.over).toBe(0)
    expect(s.isOver).toBe(false)
    expect(s.pctOfGoal).toBe(51) // round(1010/2000*100) = 50.5 -> 51
  })

  it("hitting the Goal exactly is not over", () => {
    const s = summarize([row(2000)], 2000)
    expect(s.remaining).toBe(0)
    expect(s.over).toBe(0)
    expect(s.isOver).toBe(false)
    expect(s.pctOfGoal).toBe(100)
  })

  it("reports the overage once consumption passes the Goal", () => {
    const s = summarize([row(1500), row(800)], 2000) // 2300
    expect(s.consumed).toBe(2300)
    expect(s.isOver).toBe(true)
    expect(s.over).toBe(300)
    expect(s.remaining).toBe(-300) // signed; the card shows "Over" instead
    expect(s.pctOfGoal).toBe(115)
  })

  it("sums only the macros that are present, treating the rest as zero", () => {
    const s = summarize(
      [row(320, 12, 7, 54), row(90), row(540, 38)], // kcal-only + protein-only
      2000,
    )
    expect(s.totals).toEqual({ protein: 50, fat: 7, carbs: 54 })
  })

  it("keeps decimal macro grams — no truncation", () => {
    const s = summarize([row(200, 12.4), row(100, 0.3)], 2000)
    expect(s.totals.protein).toBeCloseTo(12.7, 5)
  })

  it("never divides by zero when no Goal is set yet", () => {
    const s = summarize([row(500)], 0)
    expect(s.pctOfGoal).toBe(0) // not NaN / Infinity
    expect(s.isOver).toBe(true)
    expect(s.over).toBe(500)
  })
})

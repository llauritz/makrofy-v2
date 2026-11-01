// Seam: the onboarding daily-need estimate (src/lib/daily-need.ts). The
// numbers people will set as their Goal: Mifflin–St Jeor resting energy, an
// activity factor, weekly paces at 7,700 kcal/kg, round figures, and a floor.
import { describe, expect, it } from "vitest"

import {
  LIMITS,
  maintenanceKcal,
  paceOptions,
  parseInRange,
  roundTo50,
  type Body,
} from "@/lib/daily-need"

const body: Body = {
  sex: "female",
  age: 32,
  heightCm: 170,
  weightKg: 68,
  activity: "moderate",
}

describe("maintenanceKcal", () => {
  it("is Mifflin–St Jeor times the activity factor", () => {
    // 10·68 + 6.25·170 − 5·32 − 161 = 1421.5; × 1.55
    expect(maintenanceKcal(body)).toBeCloseTo(2203.3, 1)
    // male constant +5: 1587.5 × 1.2
    expect(
      maintenanceKcal({ ...body, sex: "male", activity: "low" })
    ).toBeCloseTo(1905, 5)
  })

  it("puts 'other' midway between female and male", () => {
    const f = maintenanceKcal(body)
    const m = maintenanceKcal({ ...body, sex: "male" })
    expect(maintenanceKcal({ ...body, sex: "other" })).toBeCloseTo(
      (f + m) / 2,
      5
    )
  })
})

describe("paceOptions", () => {
  it("offers one rounded figure for maintain", () => {
    expect(paceOptions(2203.3, "maintain")).toEqual([
      { kgPerWeek: 0, kcal: 2200 },
    ])
  })

  it("offers three gentle losing paces: 220, 385 and 550 kcal a day under", () => {
    expect(paceOptions(2203.3, "lose")).toEqual([
      { kgPerWeek: 0.2, kcal: 2000 },
      { kgPerWeek: 0.35, kcal: 1800 },
      { kgPerWeek: 0.5, kcal: 1650 },
    ])
  })

  it("offers the same three paces for gaining", () => {
    expect(paceOptions(2203.3, "gain")).toEqual([
      { kgPerWeek: 0.2, kcal: 2400 },
      { kgPerWeek: 0.35, kcal: 2600 },
      { kgPerWeek: 0.5, kcal: 2750 },
    ])
  })

  it("never suggests below 1,200 kcal, and collapses paces stuck on the floor", () => {
    expect(paceOptions(1400, "lose")).toEqual([{ kgPerWeek: 0.2, kcal: 1200 }])
    expect(paceOptions(1550, "lose")).toEqual([
      { kgPerWeek: 0.2, kcal: 1350 },
      { kgPerWeek: 0.35, kcal: 1200 },
    ])
  })
})

describe("form helpers", () => {
  it("rounds to the nearest 50", () => {
    expect(roundTo50(1928)).toBe(1950)
    expect(roundTo50(1924)).toBe(1900)
  })

  it("parses numbers within range only, accepting a decimal comma", () => {
    expect(parseInRange("68,5", LIMITS.weightKg)).toBe(68.5)
    expect(parseInRange(" 170 ", LIMITS.heightCm)).toBe(170)
    expect(parseInRange("", LIMITS.age)).toBeNull()
    expect(parseInRange("abc", LIMITS.age)).toBeNull()
    expect(parseInRange("9", LIMITS.age)).toBeNull()
    expect(parseInRange("400", LIMITS.weightKg)).toBeNull()
  })
})

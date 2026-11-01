// Seam: what the app hands the Android home screen widget
// (src/native/widget-snapshot.ts). The widget paints these strings verbatim,
// so the summary card's numbers, its copy in both languages and the empty
// next-Day face are pinned here rather than on a device.
import { describe, expect, it } from "vitest"

import { dictionaryFor, formatNumber } from "@/lib/i18n"
import {
  buildWidgetSnapshot,
  msUntilNextDay,
  widgetFace,
} from "@/native/widget-snapshot"

const row = (kcal: number, protein?: number, fat?: number, carbs?: number) => ({
  kcal,
  protein,
  fat,
  carbs,
})

const en = { t: dictionaryFor("en"), n: (v: number) => formatNumber(v, "en") }
const es = { t: dictionaryFor("es"), n: (v: number) => formatNumber(v, "es") }

describe("widgetFace", () => {
  it("reads like the summary card under the Goal", () => {
    const face = widgetFace(
      [row(820, 40.4, 20, 90), row(500, 30, 10.6, 55)],
      2000,
      en.t,
      en.n,
    )
    expect(face).toEqual({
      fraction: 0.66,
      consumed: "1,320",
      headline: "Remaining: 680",
      detail: "66% of 2,000 goal",
      macros: [
        { letter: "P", grams: "70g" },
        { letter: "F", grams: "31g" },
        { letter: "C", grams: "145g" },
      ],
      description:
        "1,320 of 2,000 kcal eaten today. Remaining: 680. Protein 70g, Fat 31g, Carbs 145g.",
    })
  })

  it("caps the ring at full and says Over past the Goal", () => {
    const face = widgetFace([row(2300)], 2000, en.t, en.n)
    expect(face.fraction).toBe(1)
    expect(face.headline).toBe("Over: 300")
    expect(face.detail).toBe("115% of 2,000 goal")
  })

  it("never divides by a zero Goal", () => {
    const face = widgetFace([row(400)], 0, en.t, en.n)
    expect(face.fraction).toBe(0)
    expect(face.detail).toBe("0% of 0 goal")
  })

  it("uses the app language's words and number convention", () => {
    const face = widgetFace([row(12500, 100)], 20000, es.t, es.n)
    expect(face.consumed).toBe("12.500")
    expect(face.headline).toBe("Restante: 7500")
    expect(face.macros[0]).toEqual({ letter: "P", grams: "100g" })
    expect(face.description).toMatch(/^12\.500 de 20\.000 kcal consumidas hoy\./)
  })
})

describe("buildWidgetSnapshot", () => {
  it("carries today's face and the empty face for the next Day", () => {
    const snap = buildWidgetSnapshot({
      day: "2026-11-01",
      entries: [row(600, 30)],
      goalKcal: 1800,
      ...en,
    })
    expect(snap.version).toBe(1)
    expect(snap.day).toBe("2026-11-01")
    expect(snap.today.consumed).toBe("600")
    expect(snap.empty).toMatchObject({
      fraction: 0,
      consumed: "0",
      headline: "Remaining: 1,800",
      detail: "0% of 1,800 goal",
    })
    expect(snap.kcalUnit).toBe("kcal")
    expect(snap.addLabel).toBe("Add food")
  })

  it("round-trips through JSON, which is how it crosses to Android", () => {
    const snap = buildWidgetSnapshot({
      day: "2026-11-01",
      entries: [],
      goalKcal: 2000,
      ...es,
    })
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap)
  })
})

describe("msUntilNextDay", () => {
  it("counts to the next local midnight", () => {
    expect(msUntilNextDay(new Date(2026, 10, 1, 23, 59, 0))).toBe(60_000)
    expect(msUntilNextDay(new Date(2026, 10, 1, 0, 0, 0))).toBe(86_400_000)
  })
})

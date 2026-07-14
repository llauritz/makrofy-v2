// Seam: the Quantity grammar (src/lib/quantity.ts, issue #37) — how a raw
// Entry label (or the add card's typed text) splits into a label and an
// optional Quantity. One tunable units table; leading or trailing token only;
// a bare number is a count; no number at all means no Quantity (the index
// treats that as a count of 1, CONTEXT.md). Kept pure and separate from the
// Suggestion index so the grammar edges are pinned independently.
import { describe, expect, it } from "vitest"
import { parseLabel } from "@/lib/quantity"

describe("parseLabel", () => {
  it("parses a trailing mass Quantity off the label", () => {
    expect(parseLabel("Banana 30g")).toEqual({
      label: "Banana",
      quantity: { kind: "mass", value: 30, numeral: 30, raw: "30g" },
    })
  })

  it("leaves a quantityless label whole", () => {
    expect(parseLabel("Banana")).toEqual({ label: "Banana", quantity: null })
    expect(parseLabel("peanut butter")).toEqual({
      label: "peanut butter",
      quantity: null,
    })
  })

  it("parses a leading Quantity — '30g Banana' and 'Banana 30g' both work", () => {
    expect(parseLabel("30g Banana")).toEqual({
      label: "Banana",
      quantity: { kind: "mass", value: 30, numeral: 30, raw: "30g" },
    })
  })

  it("reads a bare number as a count, decimals included", () => {
    expect(parseLabel("2 Banana").quantity).toEqual({
      kind: "count",
      value: 2,
      numeral: 2,
      raw: "2",
    })
    expect(parseLabel("0.5 Banana").quantity).toEqual({
      kind: "count",
      value: 0.5,
      numeral: 0.5,
      raw: "0.5",
    })
  })

  it("normalizes kg to grams and l to ml", () => {
    expect(parseLabel("Banana 0.03kg").quantity).toEqual({
      kind: "mass",
      value: 30,
      numeral: 0.03,
      raw: "0.03kg",
    })
    expect(parseLabel("milk 0.2l").quantity).toEqual({
      kind: "volume",
      value: 200,
      numeral: 0.2,
      raw: "0.2l",
    })
  })

  it("takes a comma as a decimal point only directly between digits", () => {
    // "1,5kg" is one and a half kilos…
    expect(parseLabel("1,5kg flour").quantity).toEqual({
      kind: "mass",
      value: 1500,
      numeral: 1.5,
      raw: "1,5kg",
    })
    // …but "Banana," stays label punctuation: label + Quantity, not a decimal.
    expect(parseLabel("Banana, 30g")).toEqual({
      label: "Banana,",
      quantity: { kind: "mass", value: 30, numeral: 30, raw: "30g" },
    })
  })

  it("prefers the unit-bearing end, then the trailing one", () => {
    // unit beats bare…
    expect(parseLabel("2 Banana 30g")).toEqual({
      label: "2 Banana",
      quantity: { kind: "mass", value: 30, numeral: 30, raw: "30g" },
    })
    expect(parseLabel("30g Banana 2")).toEqual({
      label: "Banana 2",
      quantity: { kind: "mass", value: 30, numeral: 30, raw: "30g" },
    })
    // …and trailing beats leading when neither (or both) carry a unit.
    expect(parseLabel("2 Banana 3").quantity).toEqual({
      kind: "count",
      value: 3,
      numeral: 3,
      raw: "3",
    })
    expect(parseLabel("30g Banana 50g").quantity).toEqual({
      kind: "mass",
      value: 50,
      numeral: 50,
      raw: "50g",
    })
  })

  it("never reads a %-token as a Quantity", () => {
    expect(parseLabel("milk 2%").quantity).toBeNull()
    expect(parseLabel("2% milk").quantity).toBeNull()
  })

  it("ignores numbers inside the label", () => {
    expect(parseLabel("toast 2 slices").quantity).toBeNull()
  })

  it("keeps a lone Quantity token as the label — an amount of nothing", () => {
    expect(parseLabel("30g")).toEqual({ label: "30g", quantity: null })
    expect(parseLabel("200")).toEqual({ label: "200", quantity: null })
  })

  it("rejects a zero Quantity and unknown units", () => {
    expect(parseLabel("0 banana").quantity).toBeNull()
    expect(parseLabel("banana 2x").quantity).toBeNull()
  })

  it("is case-insensitive about units and forgives trailing punctuation", () => {
    expect(parseLabel("Banana 30G").quantity).toEqual({
      kind: "mass",
      value: 30,
      numeral: 30,
      raw: "30G",
    })
    expect(parseLabel("Banana 30g.").quantity).toEqual({
      kind: "mass",
      value: 30,
      numeral: 30,
      raw: "30g",
    })
  })
})

// Seam: the Glossary screen's pure list logic (src/lib/glossary.ts, issue #40).
// The Glossary is the browsable, alphabetical index of every Product with its
// Rate and use count; these helpers order it, narrow it by the search field,
// and shape a Rate for the per-100g/100ml/piece display. All pure over the
// Product index — no React, no Firestore.
import { describe, expect, it } from "vitest"
import { buildProductIndex } from "@/lib/suggestions"
import {
  basisLabel,
  displayRate,
  formatRate,
  productRate,
  searchGlossary,
  sortedProducts,
  toRate,
} from "@/lib/glossary"

const DAY = 86_400_000
const NOW = Date.UTC(2026, 6, 14, 12, 0, 0)
const entry = (
  label: string,
  opts: { ageDays?: number; kcal?: number; protein?: number } = {}
) => ({
  label,
  kcal: opts.kcal ?? 0,
  protein: opts.protein,
  fat: undefined,
  carbs: undefined,
  createdAtMs: NOW - (opts.ageDays ?? 0) * DAY,
})

describe("sortedProducts", () => {
  it("orders every Product alphabetically, case-insensitively", () => {
    const index = buildProductIndex(
      [
        entry("Yoghurt", { kcal: 60, ageDays: 0 }),
        entry("apple", { kcal: 95, ageDays: 1 }),
        entry("Banana", { kcal: 105, ageDays: 2 }),
      ],
      NOW
    )
    // Frecency order would be Yoghurt, apple, Banana; the Glossary is alphabetical.
    expect(sortedProducts(index).map((p) => p.label)).toEqual([
      "apple",
      "Banana",
      "Yoghurt",
    ])
  })
})

describe("productRate", () => {
  it("shows a count Product per piece", () => {
    const index = buildProductIndex([entry("Egg", { kcal: 78 })], NOW)
    expect(productRate(index.products[0])).toEqual({ kcal: 78, basis: "each" })
  })

  it("shows a mass Product per 100 g, scaling macros to the same basis", () => {
    // 100 g Oats = 380 kcal, 13 g protein → per gram 3.8 / 0.13.
    const index = buildProductIndex(
      [entry("Oats 100g", { kcal: 380, protein: 13 })],
      NOW
    )
    expect(productRate(index.products[0])).toEqual({
      kcal: 380,
      basis: "100 g",
      protein: 13,
    })
  })

  it("shows a volume Product per 100 ml", () => {
    const index = buildProductIndex([entry("Milk 200ml", { kcal: 100 })], NOW)
    expect(productRate(index.products[0])).toEqual({
      kcal: 50,
      basis: "100 ml",
    })
  })

  it("is null for a rate-less Product", () => {
    const index = buildProductIndex([entry("Water 500ml")], NOW)
    expect(productRate(index.products[0])).toBeNull()
  })
})

describe("formatRate", () => {
  it("reads per-piece Products as 'N kcal each'", () => {
    const index = buildProductIndex([entry("Egg", { kcal: 78 })], NOW)
    expect(formatRate(index.products[0])).toBe("78 kcal each")
  })

  it("reads mass and volume Products against their 100-unit basis", () => {
    const mass = buildProductIndex([entry("Oats 100g", { kcal: 380 })], NOW)
    const vol = buildProductIndex([entry("Milk 200ml", { kcal: 100 })], NOW)
    expect(formatRate(mass.products[0])).toBe("380 kcal / 100 g")
    expect(formatRate(vol.products[0])).toBe("50 kcal / 100 ml")
  })

  it("shows an em dash for a rate-less Product", () => {
    const index = buildProductIndex([entry("Water 500ml")], NOW)
    expect(formatRate(index.products[0])).toBe("—")
  })
})

describe("displayRate", () => {
  it("scales a per-unit Rate to its basis — kcal to the integer, macros to one decimal", () => {
    // A per-gram Rate for a mass Product (any competing Reading, not just the top).
    expect(displayRate("mass", { kcal: 2.6, protein: 0.128 })).toEqual({
      kcal: 260,
      basis: "100 g",
      protein: 12.8,
    })
  })

  it("leaves a count Rate at its per-piece value and drops absent macros", () => {
    expect(displayRate("count", { kcal: 89 })).toEqual({
      kcal: 89,
      basis: "each",
    })
  })

  it("round-trips with toRate", () => {
    const rate = { kcal: 3.8, protein: 0.13 }
    const shown = displayRate("mass", rate)
    expect(toRate("mass", shown)).toEqual(rate)
  })
})

describe("toRate", () => {
  it("brings per-100g numbers back to a per-gram Rate", () => {
    expect(toRate("mass", { kcal: 380, protein: 13 })).toEqual({
      kcal: 3.8,
      protein: 0.13,
    })
  })

  it("brings per-100ml numbers back to a per-ml Rate", () => {
    expect(toRate("volume", { kcal: 50 })).toEqual({ kcal: 0.5 })
  })

  it("leaves a per-piece Rate unscaled", () => {
    expect(toRate("count", { kcal: 78, fat: 5 })).toEqual({ kcal: 78, fat: 5 })
  })

  it("round-trips productRate for a mass Product", () => {
    const index = buildProductIndex([entry("Oats 100g", { kcal: 380 })], NOW)
    const shown = productRate(index.products[0])!
    expect(toRate("mass", shown)).toEqual(index.products[0].readings[0].rate)
  })
})

describe("basisLabel", () => {
  it("names each kind's display basis", () => {
    expect(basisLabel("mass")).toBe("100 g")
    expect(basisLabel("volume")).toBe("100 ml")
    expect(basisLabel("count")).toBe("each")
  })
})

describe("searchGlossary", () => {
  const index = buildProductIndex(
    [
      entry("peanut butter", { kcal: 190, ageDays: 0 }),
      entry("Bread", { kcal: 80, ageDays: 1 }),
      entry("Banana", { kcal: 105, ageDays: 2 }),
      entry("apple", { kcal: 95, ageDays: 3 }),
    ],
    NOW
  )

  it("returns the whole list, alphabetical, for a blank query", () => {
    expect(searchGlossary(index, "  ").map((p) => p.label)).toEqual([
      "apple",
      "Banana",
      "Bread",
      "peanut butter",
    ])
  })

  it("narrows from the first character — any word prefixing, alphabetical", () => {
    // 'b' drops apple and keeps every Product with a b-word (butter counts).
    expect(searchGlossary(index, "b").map((p) => p.label)).toEqual([
      "Banana",
      "Bread",
      "peanut butter",
    ])
    expect(searchGlossary(index, "but").map((p) => p.label)).toEqual([
      "peanut butter",
    ])
  })

  it("matches every query word — 'pea but' finds peanut butter", () => {
    expect(searchGlossary(index, "pea but").map((p) => p.label)).toEqual([
      "peanut butter",
    ])
  })

  it("normalizes the query like the typeahead — 'Banana,' still finds Banana", () => {
    expect(searchGlossary(index, "Banana,").map((p) => p.label)).toEqual([
      "Banana",
    ])
  })

  it("matches an absorbed label so a merged-away typo still finds its survivor", () => {
    const merged = buildProductIndex(
      [entry("Banana", { kcal: 105 }), entry("banangs", { kcal: 100 })],
      NOW,
      new Map([
        [
          "count:banana",
          {
            key: "count:banana",
            aliases: [{ key: "count:banangs", label: "banangs", atMs: NOW }],
          },
        ],
      ])
    )
    expect(searchGlossary(merged, "banang").map((p) => p.key)).toEqual([
      "count:banana",
    ])
  })
})

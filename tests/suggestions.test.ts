// Seam: the pure history-typeahead logic behind Suggestions
// (src/lib/suggestions.ts). Frecency ranking, normalized-label dedup
// and the sticky word-by-word search are all pure reductions over the entry
// history — kept independent of any Firestore round-trip or React render so the
// ranking maths and the fiddly sticky-search edges are pinned here (ADR 0005,
// spec § Add flow, issue #18). dedupKey is deliberately the one normalization
// point a future Quantity grammar strips amounts at, before dedup (#37).
import { describe, expect, it } from "vitest"
import {
  advanceSuggestions,
  buildProductIndex,
  currentSearchWord,
  dedupKey,
  EMPTY_SUGGESTIONS,
  matchProducts,
} from "@/lib/suggestions"

// A fixed "now" and a minimal history-entry builder: the index reads only the
// label, nutrients and the log time (ms). ageDays back-dates an Entry from NOW.
const DAY = 86_400_000
const NOW = Date.UTC(2026, 6, 14, 12, 0, 0)
const entry = (
  label: string,
  opts: {
    ageDays?: number
    kcal?: number
    protein?: number
    fat?: number
    carbs?: number
  } = {},
) => ({
  label,
  kcal: opts.kcal ?? 0,
  protein: opts.protein,
  fat: opts.fat,
  carbs: opts.carbs,
  createdAtMs: NOW - (opts.ageDays ?? 0) * DAY,
})

describe("dedupKey", () => {
  it("is case-insensitive", () => {
    expect(dedupKey("Banana")).toBe(dedupKey("banana"))
    expect(dedupKey("PEANUT BUTTER")).toBe(dedupKey("peanut butter"))
  })

  it("collapses surrounding and internal whitespace", () => {
    expect(dedupKey("  peanut   butter ")).toBe(dedupKey("peanut butter"))
  })

  it("ignores trailing punctuation", () => {
    expect(dedupKey("Coffee.")).toBe(dedupKey("Coffee"))
    expect(dedupKey("Toast!!!")).toBe(dedupKey("toast"))
  })

  it("keeps distinct foods distinct", () => {
    expect(dedupKey("Banana")).not.toBe(dedupKey("Apple"))
  })
})

describe("buildProductIndex", () => {
  it("collapses label variants into one Product and counts every use", () => {
    const { products } = buildProductIndex(
      [entry("Banana"), entry("banana "), entry("BANANA.")],
      NOW,
    )
    expect(products).toHaveLength(1)
    expect(products[0].useCount).toBe(3)
  })

  it("shows the freshest Entry's label, calories and macros", () => {
    const { products } = buildProductIndex(
      [
        entry("banana", { ageDays: 5, kcal: 90 }),
        entry("Banana", { ageDays: 1, kcal: 105, protein: 1.3 }),
      ],
      NOW,
    )
    expect(products[0]).toMatchObject({ label: "Banana", kcal: 105, protein: 1.3 })
  })

  it("scores frecency as a ~3-week half-life decay summed over uses", () => {
    const { products } = buildProductIndex(
      [entry("tea", { ageDays: 0 }), entry("tea", { ageDays: 21 })],
      NOW,
    )
    // decay = 0.5^(age/21): 0.5^0 + 0.5^1 = 1 + 0.5
    expect(products[0].score).toBeCloseTo(1.5, 5)
  })

  it("ranks recent habits above stale bulk — frecency, not raw count", () => {
    const { products } = buildProductIndex(
      [
        entry("coffee", { ageDays: 0 }), // 1.0
        entry("green tea", { ageDays: 42 }), // 0.25
        entry("green tea", { ageDays: 42 }), // + 0.25 = 0.5
      ],
      NOW,
    )
    expect(products.map((p) => p.label)).toEqual(["coffee", "green tea"])
  })
})

describe("currentSearchWord", () => {
  it("is the last whitespace-delimited token — the word being typed", () => {
    expect(currentSearchWord("butter")).toBe("butter")
    expect(currentSearchWord("10g butter")).toBe("butter")
  })

  it("is empty the moment a space starts the next word", () => {
    expect(currentSearchWord("10g ")).toBe("")
    expect(currentSearchWord("")).toBe("")
  })
})

describe("matchProducts", () => {
  const menu = buildProductIndex(
    [
      entry("apple pie", { ageDays: 0 }),
      entry("apple juice", { ageDays: 5 }),
      entry("apple sauce", { ageDays: 10 }),
      entry("apple crumble", { ageDays: 15 }),
      entry("apple tart", { ageDays: 20 }),
      entry("banana", { ageDays: 0 }),
    ],
    NOW,
  )

  it("matches the word prefix-wise against any word in the label", () => {
    expect(matchProducts(menu, "ban").map((p) => p.label)).toEqual(["banana"])
    // a word inside the label, not just the first, matches
    expect(matchProducts(menu, "juice").map((p) => p.label)).toEqual([
      "apple juice",
    ])
  })

  it("stays silent until the word reaches the minimum length", () => {
    expect(matchProducts(menu, "b")).toEqual([])
  })

  it("returns at most MAX_ROWS, frecency-ranked", () => {
    const rows = matchProducts(menu, "apple")
    expect(rows).toHaveLength(4) // five apples match; the stalest is dropped
    expect(rows.map((p) => p.label)).toEqual([
      "apple pie",
      "apple juice",
      "apple sauce",
      "apple crumble",
    ])
  })
})

describe("advanceSuggestions (sticky word-by-word)", () => {
  const index = buildProductIndex(
    [
      entry("butter", { ageDays: 0 }),
      entry("peanut butter", { ageDays: 0 }),
      entry("bread", { ageDays: 0 }),
    ],
    NOW,
  )

  it("stays empty until the first word is long enough to search", () => {
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "b", index)
    expect(s.rows).toEqual([])
  })

  it("searches the word being typed", () => {
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "bre", index)
    expect(s.rows.map((p) => p.label)).toEqual(["bread"])
  })

  it("keeps the previous word's results until the next word matches", () => {
    let s = advanceSuggestions(EMPTY_SUGGESTIONS, "butter", index)
    expect(s.rows.map((p) => p.label)).toContain("butter")
    const shown = s.rows

    // A space then a short/typo'd next word never yanks the results away.
    s = advanceSuggestions(s, "butter ", index) // new word "", too short
    expect(s.rows).toBe(shown)
    s = advanceSuggestions(s, "butter a", index) // "a", too short
    expect(s.rows).toBe(shown)
    s = advanceSuggestions(s, "butter an", index) // "an", no match in history
    expect(s.rows).toBe(shown)
  })

  it("replaces the results the instant the new word matches", () => {
    let s = advanceSuggestions(EMPTY_SUGGESTIONS, "butter", index)
    s = advanceSuggestions(s, "butter bre", index)
    expect(s.rows.map((p) => p.label)).toEqual(["bread"])
  })

  it("clears when the input goes empty", () => {
    let s = advanceSuggestions(EMPTY_SUGGESTIONS, "bread", index)
    expect(s.rows).toHaveLength(1)
    s = advanceSuggestions(s, "", index)
    expect(s).toEqual(EMPTY_SUGGESTIONS)
  })
})

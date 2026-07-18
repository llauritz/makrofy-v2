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
  refreshSuggestions,
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
    expect(products[0].label).toBe("Banana")
    expect(products[0].readings[0].base).toMatchObject({
      label: "Banana",
      kcal: 105,
      protein: 1.3,
    })
  })

  it("merges the same food measured the same way — across units and positions", () => {
    const { products } = buildProductIndex(
      [
        entry("Banana 30g", { kcal: 90 }),
        entry("30g Banana", { kcal: 90 }),
        entry("Banana 0.03kg", { kcal: 90 }),
      ],
      NOW,
    )
    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({ kind: "mass", label: "Banana", useCount: 3 })
  })

  it("treats a quantityless label as a count of 1 — plain and counted share", () => {
    const { products } = buildProductIndex(
      [entry("Banana", { kcal: 105 }), entry("2 Banana", { kcal: 200, ageDays: 1 })],
      NOW,
    )
    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({ kind: "count", useCount: 2 })
  })

  it("splits the same label measured differently — mass and count differ", () => {
    const { products } = buildProductIndex(
      [entry("Banana 30g", { kcal: 90 }), entry("2 Banana", { kcal: 200 })],
      NOW,
    )
    expect(products.map((p) => p.kind).sort()).toEqual(["count", "mass"])
  })
})

describe("buildProductIndex — Readings (#37)", () => {
  it("merges per-unit rates within ±5% into one Reading anchored on the freshest Entry", () => {
    const { products } = buildProductIndex(
      [
        entry("Banana, 30g", { kcal: 90, protein: 0.9, ageDays: 5 }),
        entry("Banana 40g", { kcal: 120, protein: 1.2, ageDays: 1 }),
      ],
      NOW,
    )
    expect(products).toHaveLength(1)
    expect(products[0].readings).toHaveLength(1)
    const reading = products[0].readings[0]
    expect(reading.votes).toBe(2)
    expect(reading.rate.kcal).toBeCloseTo(3, 5)
    expect(reading.rate.protein).toBeCloseTo(0.03, 5)
    expect(reading.base).toMatchObject({
      label: "Banana 40g",
      quantityRaw: "40g",
      quantityValue: 40,
      kcal: 120,
      protein: 1.2,
    })
  })

  it("keeps conflicting rates as competing Readings — most-attested first, freshest breaks ties", () => {
    // The banana-typo case: 200 kcal then 50 kcal for the same plain label.
    const tie = buildProductIndex(
      [
        entry("banana", { kcal: 200, ageDays: 2 }),
        entry("banana", { kcal: 50, ageDays: 1 }),
      ],
      NOW,
    ).products[0]
    expect(tie.readings.map((r) => r.base.kcal)).toEqual([50, 200])
    expect(tie.readings.map((r) => r.votes)).toEqual([1, 1])

    // The spec's Rate vote: 30g=90 ×2 and 40g=120 ×2 share a bucket (3.0/g,
    // four attestations) and beat 50g=130 ×3 (2.6/g) — even though the 2.6
    // bucket has the freshest Entry.
    const voted = buildProductIndex(
      [
        entry("oats 30g", { kcal: 90, ageDays: 6 }),
        entry("oats 30g", { kcal: 90, ageDays: 5 }),
        entry("oats 40g", { kcal: 120, ageDays: 4 }),
        entry("oats 40g", { kcal: 120, ageDays: 3 }),
        entry("oats 50g", { kcal: 130, ageDays: 2 }),
        entry("oats 50g", { kcal: 130, ageDays: 1 }),
        entry("oats 50g", { kcal: 130, ageDays: 0 }),
      ],
      NOW,
    ).products[0]
    expect(voted.readings.map((r) => r.votes)).toEqual([4, 3])
    expect(voted.readings[0].rate.kcal).toBeCloseTo(3, 5)
    expect(voted.readings[1].rate.kcal).toBeCloseTo(2.6, 5)
  })

  it("never lets zero-kcal Entries vote — they attest use, not a Rate", () => {
    const { products } = buildProductIndex(
      [
        entry("banana", { kcal: 100, ageDays: 3 }),
        entry("banana", { kcal: 0, ageDays: 1 }),
      ],
      NOW,
    )
    expect(products[0].useCount).toBe(2)
    expect(products[0].readings).toHaveLength(1)
    expect(products[0].readings[0]).toMatchObject({ votes: 1 })
    expect(products[0].readings[0].base.kcal).toBe(100)
  })

  it("leaves a Product whose Entries never voted with no Readings at all", () => {
    const { products } = buildProductIndex(
      [entry("tea"), entry("tea", { ageDays: 1 })],
      NOW,
    )
    expect(products[0].readings).toEqual([])
    expect(products[0].useCount).toBe(2)
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

  it("returns every match, frecency-ranked — capping happens at the row stage", () => {
    expect(matchProducts(menu, "apple").map((p) => p.label)).toEqual([
      "apple pie",
      "apple juice",
      "apple sauce",
      "apple crumble",
      "apple tart",
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

describe("advanceSuggestions — competing Reading rows (#37)", () => {
  it("offers conflicting Readings as separate rows, freshest tie-break first", () => {
    // The banana-typo case: 200 kcal then 50 kcal under the same plain label
    // must compete as two Suggestions, never collapse into one ×2 row.
    const index = buildProductIndex(
      [
        entry("banana", { kcal: 200, ageDays: 2 }),
        entry("banana", { kcal: 50, ageDays: 1 }),
      ],
      NOW,
    )
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "banana", index)
    expect(s.rows.map((r) => r.kcal)).toEqual([50, 200])
    expect(s.rows.map((r) => r.useCount)).toEqual([1, 1])
    // No Quantity typed — the #18 baseline: a tap fills label and numbers.
    expect(s.rows[0].fillLabel).toBe("banana")
    expect(s.rows[0].hint).toBeUndefined()
    expect(s.rows[0].key).not.toBe(s.rows[1].key)
  })

  it("caps the expanded rows at MAX_ROWS, best Products first", () => {
    const index = buildProductIndex(
      [
        entry("apple pie", { kcal: 100, ageDays: 0 }),
        entry("apple pie", { kcal: 300, ageDays: 1 }),
        entry("apple juice", { kcal: 50, ageDays: 2 }),
        entry("apple sauce", { kcal: 60, ageDays: 3 }),
        entry("apple tart", { kcal: 70, ageDays: 4 }),
      ],
      NOW,
    )
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "apple", index)
    expect(s.rows.map((r) => r.kcal)).toEqual([100, 300, 50, 60])
  })
})

describe("advanceSuggestions — scaled rows (#37)", () => {
  // History says "Banana, 30g" = 90 kcal (1.1 g protein).
  const index = buildProductIndex(
    [entry("Banana, 30g", { kcal: 90, protein: 1.1, ageDays: 1 })],
    NOW,
  )

  it("scales numbers from the Reading's rate to the typed Quantity", () => {
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "Banana 40g", index)
    expect(s.rows).toHaveLength(1)
    expect(s.rows[0]).toMatchObject({
      label: "Banana 40g",
      kcal: 120,
      protein: 1.5, // 1.1 × 40/30 = 1.4667 → one decimal
      hint: "30g · 90",
    })
    // Quantity typed — the typed label is the truth: a tap fills numbers only.
    expect(s.rows[0].fillLabel).toBeUndefined()
    // Blanks stay blank: the base never logged fat or carbs.
    expect(s.rows[0].fat).toBeUndefined()
    expect(s.rows[0].carbs).toBeUndefined()
  })

  it("accepts the Quantity at either end", () => {
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "40g Banana", index)
    expect(s.rows[0]).toMatchObject({ label: "Banana 40g", kcal: 120 })
  })

  it("matches even when the typed label keeps its comma — 'Banana, 40g'", () => {
    // Retyping the historical label exactly as it was logged must not go
    // silent: the search word "Banana," normalizes like the Product key does.
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "Banana, 40g", index)
    expect(s.rows[0]).toMatchObject({ label: "Banana 40g", kcal: 120 })
  })

  it("boosts a same-kind Product into view, not just within the cap", () => {
    // Four fresher count Products fill MAX_ROWS; the stale mass Product would
    // be invisible on frecency alone. Its unit typed, it must rank first —
    // the boost reorders the ranking, it doesn't just shuffle the survivors.
    const crowded = buildProductIndex(
      [
        entry("milk shake", { kcal: 300 }),
        entry("milk bread", { kcal: 250 }),
        entry("milk pudding", { kcal: 200 }),
        entry("milk tart", { kcal: 150 }),
        entry("milk 100ml", { kcal: 50, ageDays: 30 }),
      ],
      NOW,
    )
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "milk 200ml", crowded)
    expect(s.rows[0]).toMatchObject({ label: "milk 200ml", kcal: 100 })
    expect(s.rows).toHaveLength(4)
  })

  it("rounds scaled kcal to the nearest integer", () => {
    const odd = buildProductIndex([entry("rice 30g", { kcal: 95 })], NOW)
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "rice 40g", odd)
    expect(s.rows[0].kcal).toBe(127) // 95 × 40/30 = 126.67
  })

  it("rescales live after a fill — edit 30g to 60g, a second-tap row appears", () => {
    let s = advanceSuggestions(EMPTY_SUGGESTIONS, "Banana 30g", index)
    expect(s.rows[0].kcal).toBe(90)
    s = advanceSuggestions(s, "Banana 60g", index)
    expect(s.rows[0].kcal).toBe(180)
  })

  it("matches label-only and scales every Product by its own Rate", () => {
    // Mass banana at 3 kcal/g; count banana at 100 kcal each (more frecent).
    const both = buildProductIndex(
      [
        entry("Banana 30g", { kcal: 90, ageDays: 3 }),
        entry("2 Banana", { kcal: 200, ageDays: 0 }),
        entry("2 Banana", { kcal: 200, ageDays: 1 }),
      ],
      NOW,
    )
    // A bare number is unit-blind: both Products scale, frecency ranks.
    let s = advanceSuggestions(EMPTY_SUGGESTIONS, "Banana 10", both)
    expect(s.rows.map((r) => r.kcal)).toEqual([1000, 30])
    // A typed unit boosts the same-kind Product first — and never filters.
    s = advanceSuggestions(s, "Banana 30g", both)
    expect(s.rows.map((r) => r.kcal)).toEqual([90, 3000])
  })

  it("never invents numbers for a Product that has no Readings", () => {
    const blank = buildProductIndex(
      [entry("tea"), entry("tea", { ageDays: 1 })],
      NOW,
    )
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "tea 200ml", blank)
    expect(s.rows[0].kcal).toBe(0)
    expect(s.rows[0].useCount).toBe(2)
    expect(s.rows[0].hint).toBeUndefined()
  })
})

describe("SuggestionRow.productKey (#73)", () => {
  // The long-press curation card looks its Product up by this key — every row
  // shape must name its backing Product explicitly, never via the row key.
  it("names the backing Product on baseline and competing-Reading rows", () => {
    const index = buildProductIndex(
      [
        entry("banana", { kcal: 200, ageDays: 2 }),
        entry("banana", { kcal: 50, ageDays: 1 }),
      ],
      NOW,
    )
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "banana", index)
    expect(s.rows).toHaveLength(2)
    for (const row of s.rows) {
      expect(row.productKey).toBe(index.products[0].key)
    }
  })

  it("names the backing Product on a rate-less Product's row", () => {
    const index = buildProductIndex([entry("water 500ml")], NOW)
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "water", index)
    expect(s.rows[0].productKey).toBe(index.products[0].key)
  })

  it("names the backing Product on a scaled row", () => {
    const index = buildProductIndex(
      [entry("Banana 30g", { kcal: 90, ageDays: 1 })],
      NOW,
    )
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "Banana 40g", index)
    expect(s.rows[0].productKey).toBe(index.products[0].key)
  })
})

describe("refreshSuggestions (#73)", () => {
  const before = buildProductIndex([entry("banana", { kcal: 50 })], NOW)
  const after = buildProductIndex([entry("banana", { kcal: 120 })], NOW)

  it("recomputes stuck rows against a re-derived index — trailing space", () => {
    // The sticky search deliberately keeps rows while the input's last word
    // isn't matching ("banana "). A curation edit re-derives the index in
    // exactly that state; the refresh must recompute from the STICKY word,
    // not the in-progress one.
    let s = advanceSuggestions(EMPTY_SUGGESTIONS, "banana", before)
    s = advanceSuggestions(s, "banana ", before)
    expect(s.rows[0].kcal).toBe(50)

    const r = refreshSuggestions(s, "banana ", after)
    expect(r.rows[0].kcal).toBe(120)
    expect(r.word).toBe("banana")
  })

  it("recomputes when the next word is still too short to search", () => {
    let s = advanceSuggestions(EMPTY_SUGGESTIONS, "banana", before)
    s = advanceSuggestions(s, "banana a", before)
    const r = refreshSuggestions(s, "banana a", after)
    expect(r.rows[0].kcal).toBe(120)
  })

  it("keeps scaling by the typed Quantity", () => {
    const mass = buildProductIndex([entry("rice 30g", { kcal: 90 })], NOW)
    const massAfter = buildProductIndex([entry("rice 30g", { kcal: 120 })], NOW)
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "rice 60g", mass)
    expect(s.rows[0].kcal).toBe(180)
    const r = refreshSuggestions(s, "rice 60g", massAfter)
    expect(r.rows[0].kcal).toBe(240)
  })

  it("empties rather than sticks when the shown Product vanished", () => {
    // advanceSuggestions sticks on no-match (typing case); a refresh must
    // not — the data moved, not the typing.
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "banana", before)
    const gone = buildProductIndex([entry("toast", { kcal: 80 })], NOW)
    const r = refreshSuggestions(s, "banana", gone)
    expect(r.rows).toEqual([])
  })

  it("leaves the resting state alone", () => {
    expect(refreshSuggestions(EMPTY_SUGGESTIONS, "", after)).toBe(
      EMPTY_SUGGESTIONS,
    )
  })
})

// Seam: overlay application inside the Product-index derivation
// (src/lib/suggestions.ts, issue #40, ADR 0009). Glossary curation is stored
// as a per-Product correction overlay — Reading edits and deletions, Pins,
// Aliases, Product deletes — applied as the final step of the derived index
// (ADR 0005). Logged Entries are untouchable: every behavior here is observed
// through the rebuilt index, never through a mutated Entry.
import { describe, expect, it } from "vitest"
import {
  advanceSuggestions,
  buildProductIndex,
  EMPTY_SUGGESTIONS,
  matchProducts,
  type ProductOverlay,
} from "@/lib/suggestions"

// Same fixed "now" and history-entry builder as tests/suggestions.test.ts.
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
  } = {}
) => ({
  label,
  kcal: opts.kcal ?? 0,
  protein: opts.protein,
  fat: opts.fat,
  carbs: opts.carbs,
  createdAtMs: NOW - (opts.ageDays ?? 0) * DAY,
})

// An overlay map from partial docs — every overlay carries its own key.
const overlays = (...docs: (Partial<ProductOverlay> & { key: string })[]) =>
  new Map(docs.map((d) => [d.key, d as ProductOverlay]))

describe("buildProductIndex — Reading edits (#40)", () => {
  it("rewrites past votes to the corrected value, keeping the votes — '260 ×3' edited reads '89 ×3'", () => {
    const { products } = buildProductIndex(
      [
        entry("brownie", { kcal: 260, ageDays: 5 }),
        entry("brownie", { kcal: 260, ageDays: 4 }),
        entry("brownie", { kcal: 260, ageDays: 3 }),
      ],
      NOW,
      overlays({
        key: "count:brownie",
        edits: [{ from: 260, rate: { kcal: 89 }, atMs: NOW - DAY }],
      })
    )
    expect(products).toHaveLength(1)
    expect(products[0].readings).toHaveLength(1)
    expect(products[0].readings[0].votes).toBe(3)
    expect(products[0].readings[0].rate.kcal).toBe(89)
  })

  it("seeds a fresh ×1 Reading on a rate-less Product from a from-null edit", () => {
    const { products } = buildProductIndex(
      [entry("tea"), entry("tea", { ageDays: 1 })],
      NOW,
      overlays({
        key: "count:tea",
        edits: [{ from: null, rate: { kcal: 2 }, atMs: NOW - DAY }],
      })
    )
    expect(products[0].useCount).toBe(2)
    expect(products[0].readings).toHaveLength(1)
    expect(products[0].readings[0]).toMatchObject({ votes: 1 })
    expect(products[0].readings[0].rate.kcal).toBe(2)
  })
})

describe("buildProductIndex — Reading deletions (#40)", () => {
  it("silences the deleted Reading's past votes, leaving the survivors", () => {
    // '300 ×4 · 89 ×3' → delete the 300 Reading → Rate drops to 89.
    const { products } = buildProductIndex(
      [
        entry("brownie", { kcal: 300, ageDays: 7 }),
        entry("brownie", { kcal: 300, ageDays: 6 }),
        entry("brownie", { kcal: 300, ageDays: 5 }),
        entry("brownie", { kcal: 300, ageDays: 4 }),
        entry("brownie", { kcal: 89, ageDays: 3 }),
        entry("brownie", { kcal: 89, ageDays: 2 }),
        entry("brownie", { kcal: 89, ageDays: 1 }),
      ],
      NOW,
      overlays({
        key: "count:brownie",
        deletions: [{ from: 300, atMs: NOW - DAY / 2 }],
      })
    )
    expect(products[0].readings).toHaveLength(1)
    expect(products[0].readings[0]).toMatchObject({ votes: 3 })
    expect(products[0].readings[0].rate.kcal).toBe(89)
  })

  it("lets an Entry logged after the deletion re-attest the same value fresh", () => {
    const { products } = buildProductIndex(
      [
        entry("brownie", { kcal: 300, ageDays: 5 }),
        entry("brownie", { kcal: 300, ageDays: 4 }),
        // Logged after the deletion — a fresh observation the delete never reaches.
        entry("brownie", { kcal: 300, ageDays: 1 }),
      ],
      NOW,
      overlays({
        key: "count:brownie",
        deletions: [{ from: 300, atMs: NOW - 3 * DAY }],
      })
    )
    expect(products[0].readings).toHaveLength(1)
    expect(products[0].readings[0]).toMatchObject({ votes: 1 })
    expect(products[0].readings[0].rate.kcal).toBe(300)
  })
})

describe("buildProductIndex — Pin (#40)", () => {
  // '300 ×4 · 89 ×3': untouched the Rate is 300; pinning 89 makes it the Rate.
  const history = [
    entry("brownie", { kcal: 300, ageDays: 7 }),
    entry("brownie", { kcal: 300, ageDays: 6 }),
    entry("brownie", { kcal: 300, ageDays: 5 }),
    entry("brownie", { kcal: 300, ageDays: 4 }),
    entry("brownie", { kcal: 89, ageDays: 3 }),
    entry("brownie", { kcal: 89, ageDays: 2 }),
    entry("brownie", { kcal: 89, ageDays: 1 }),
  ]

  it("makes the pinned Reading the Rate regardless of votes, outvoted Readings beneath", () => {
    const { products } = buildProductIndex(
      history,
      NOW,
      overlays({ key: "count:brownie", pinnedRate: 89 })
    )
    const readings = products[0].readings
    expect(readings).toHaveLength(2)
    // Pinned Reading leads (it is the Rate); the outvoted 300 stays visible.
    expect(readings[0]).toMatchObject({
      rate: { kcal: 89 },
      votes: 3,
      pinned: true,
    })
    expect(readings[1]).toMatchObject({ rate: { kcal: 300 }, votes: 4 })
    expect(readings[1].pinned).toBeFalsy()
  })

  it("leaves the vote winner in front when nothing is pinned", () => {
    const { products } = buildProductIndex(history, NOW)
    expect(products[0].readings[0]).toMatchObject({
      rate: { kcal: 300 },
      votes: 4,
    })
    expect(products[0].readings[0].pinned).toBeFalsy()
  })
})

describe("buildProductIndex — Product delete (timestamped forget, #40)", () => {
  it("drops a Product whose every Entry predates the delete", () => {
    const { products } = buildProductIndex(
      [
        entry("brownie", { kcal: 300, ageDays: 5 }),
        entry("brownie", { kcal: 300, ageDays: 4 }),
        entry("coffee", { kcal: 5, ageDays: 3 }),
      ],
      NOW,
      overlays({ key: "count:brownie", deletedAtMs: NOW - 2 * DAY })
    )
    expect(products.map((p) => p.label)).toEqual(["coffee"])
  })

  it("recreates the Product fresh from Entries logged after the delete — old votes gone", () => {
    const { products } = buildProductIndex(
      [
        entry("brownie", { kcal: 300, ageDays: 5 }),
        entry("brownie", { kcal: 300, ageDays: 4 }),
        // Committed the next day, after the delete — resurrects it fresh.
        entry("brownie", { kcal: 89, ageDays: 1 }),
      ],
      NOW,
      overlays({ key: "count:brownie", deletedAtMs: NOW - 2 * DAY })
    )
    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({ label: "brownie", useCount: 1 })
    expect(products[0].readings).toHaveLength(1)
    expect(products[0].readings[0]).toMatchObject({
      votes: 1,
      rate: { kcal: 89 },
    })
  })
})

describe("buildProductIndex — Alias / merge (#40)", () => {
  // "Banangs" merged into "Banana", both gram. The survivor overlay lives on
  // the survivor key and lists the absorbed label as an Alias.
  const merged = () =>
    overlays({
      key: "mass:banana",
      aliases: [{ key: "mass:banangs", label: "Banangs", atMs: NOW - DAY }],
    })

  it("folds the absorbed Product's Entries into the survivor — one Product, summed counts", () => {
    const { products } = buildProductIndex(
      [
        entry("Banana 100g", { kcal: 89, ageDays: 5 }),
        entry("Banangs 100g", { kcal: 90, ageDays: 4 }),
        entry("Banangs 200g", { kcal: 180, ageDays: 3 }),
      ],
      NOW,
      merged()
    )
    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({ key: "mass:banana", useCount: 3 })
    // Readings recompute over the union pool — all ~0.9 kcal/g, one Reading ×3.
    expect(products[0].readings).toHaveLength(1)
    expect(products[0].readings[0].votes).toBe(3)
  })

  it("keeps the survivor's label canonical even when an absorbed Entry is freshest", () => {
    const { products } = buildProductIndex(
      [
        entry("Banana 100g", { kcal: 89, ageDays: 5 }),
        entry("banangs 100g", { kcal: 90, ageDays: 1 }), // freshest, but absorbed
      ],
      NOW,
      merged()
    )
    expect(products[0].label).toBe("Banana")
    // The absorbed label never resurfaces as a Reading base either.
    expect(products[0].readings[0].base.label).not.toContain("banang")
  })

  it("lists the absorbed label as an Alias on the survivor", () => {
    const { products } = buildProductIndex(
      [entry("Banana 100g", { kcal: 89 }), entry("Banangs 100g", { kcal: 90 })],
      NOW,
      merged()
    )
    expect(products[0].aliases.map((a) => a.label)).toEqual(["Banangs"])
  })

  it("still matches the absorbed label — typing 'banangs' suggests the survivor", () => {
    const index = buildProductIndex(
      [entry("Banana 100g", { kcal: 89 }), entry("Banangs 100g", { kcal: 90 })],
      NOW,
      merged()
    )
    expect(matchProducts(index, "banangs").map((p) => p.key)).toEqual([
      "mass:banana",
    ])
  })

  it("a no-quantity tap-fill writes the canonical label, never the absorbed one", () => {
    // Count Bananas with a fresher absorbed 'banangs' typo.
    const index = buildProductIndex(
      [
        entry("Banana", { kcal: 105, ageDays: 5 }),
        entry("banangs", { kcal: 100, ageDays: 1 }),
      ],
      NOW,
      overlays({
        key: "count:banana",
        aliases: [{ key: "count:banangs", label: "banangs", atMs: NOW - DAY }],
      })
    )
    const s = advanceSuggestions(EMPTY_SUGGESTIONS, "banangs", index)
    expect(s.rows.every((r) => !/banang/i.test(r.fillLabel ?? ""))).toBe(true)
    expect(s.rows.some((r) => r.fillLabel === "Banana")).toBe(true)
  })

  it("unmerges when the Alias is removed — the two Products come back", () => {
    const history = [
      entry("Banana 100g", { kcal: 89 }),
      entry("Banangs 100g", { kcal: 90 }),
    ]
    // No overlay = no alias mapping: they regroup under their natural keys.
    const { products } = buildProductIndex(history, NOW)
    expect(products.map((p) => p.key).sort()).toEqual([
      "mass:banana",
      "mass:banangs",
    ])
  })

  it("leaves a plain Product with an empty alias list", () => {
    const { products } = buildProductIndex(
      [entry("Banana", { kcal: 105 })],
      NOW
    )
    expect(products[0].aliases).toEqual([])
  })
})

// The Glossary screen's pure list logic (issue #40, CONTEXT.md "Glossary").
// The Glossary is the browsable, alphabetical index of every Product; these
// helpers order it, narrow it by the search field, and shape a Product's Rate
// for the per-100g/100ml/piece display. All pure over the Product index — no
// React, no Firestore — so the ordering and the Rate maths stay testable
// independent of the screen (tests/glossary.test.ts).

import {
  productMatchesWord,
  type Product,
  type ProductIndex,
  type Rate,
} from "./suggestions"
import type { QuantityKind } from "./quantity"

// The scale factor each Quantity kind reads against: per 100 g (mass), per 100
// ml (volume), per single piece (count). The basis *words* ("100 g" / "each")
// are a display concern and live in the dictionary (glossary.basis, #25); this
// module only does the maths.
const BASIS_FACTOR: Record<QuantityKind, number> = {
  mass: 100,
  volume: 100,
  count: 1,
}

/**
 * A Product's Rate scaled to its display basis (per 100 g / 100 ml / piece):
 * kcal and any logged macros for one basis portion. The numbers round the way
 * Suggestions do — kcal to the integer, macros to one decimal. The basis label
 * is localized at the render layer, not carried here.
 */
export interface GlossaryRate {
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
}

/**
 * A per-unit Rate scaled to its display basis (per 100 g / 100 ml / piece):
 * kcal to the integer, macros to one decimal (the way Suggestions round). The
 * one place per-unit numbers become display numbers — the Glossary row, the
 * detail's Rate, and each Reading row all read through here.
 */
export function displayRate(kind: QuantityKind, rate: Rate): GlossaryRate {
  const factor = BASIS_FACTOR[kind]
  const macro = (n: number | undefined) =>
    n === undefined ? undefined : Math.round(n * factor * 10) / 10
  const display: GlossaryRate = {
    kcal: Math.round(rate.kcal * factor),
  }
  if (rate.protein !== undefined) display.protein = macro(rate.protein)
  if (rate.fat !== undefined) display.fat = macro(rate.fat)
  if (rate.carbs !== undefined) display.carbs = macro(rate.carbs)
  return display
}

/**
 * The Product's Rate for display, or null when it is rate-less (only
 * 0-/blank-kcal history ever attested it). The Rate is the top Reading — the
 * pinned one, else the vote winner (CONTEXT.md "Rate").
 */
export function productRate(product: Product): GlossaryRate | null {
  const rate = product.readings[0]?.rate
  return rate ? displayRate(product.kind, rate) : null
}

/**
 * Convert numbers entered against the display basis (per 100 g / 100 ml /
 * piece) back into the per-unit Rate the overlay stores — the inverse of
 * productRate's scaling, used when the curation editor commits an edited or
 * newly-entered Reading value.
 */
/**
 * The value a Reading edit / new Reading commits — kcal and any macros the
 * user typed, all against the Product's display basis (per 100 g / 100 ml /
 * piece). toRate converts it to the per-unit Rate the overlay stores.
 */
export interface PerBasis {
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
}

export function toRate(kind: QuantityKind, perBasis: PerBasis): Rate {
  const factor = BASIS_FACTOR[kind]
  const down = (n: number | undefined) =>
    n === undefined ? undefined : n / factor
  const rate: Rate = { kcal: perBasis.kcal / factor }
  if (perBasis.protein !== undefined) rate.protein = down(perBasis.protein)
  if (perBasis.fat !== undefined) rate.fat = down(perBasis.fat)
  if (perBasis.carbs !== undefined) rate.carbs = down(perBasis.carbs)
  return rate
}

// Locale-agnostic alphabetical order, case-insensitive ("apple" before
// "Banana"), stable enough for the one-screen index.
const byLabel = (a: Product, b: Product) =>
  a.label.localeCompare(b.label, undefined, { sensitivity: "base" })

/** Every Product, alphabetically — the Glossary's resting order. */
export function sortedProducts(index: ProductIndex): Product[] {
  return [...index.products].sort(byLabel)
}

/**
 * The Glossary list narrowed by the search field, kept alphabetical. A blank
 * query is the whole list. Otherwise every whitespace word of the query must
 * prefix some word of a Product's label or an absorbed alias label — so "but"
 * finds "peanut butter", "pea but" finds it too, and a merged-away typo still
 * finds its survivor (CONTEXT.md "Alias"). Unlike the typeahead this narrows
 * from the very first character: the search field is a filter, not a fill.
 */
export function searchGlossary(index: ProductIndex, query: string): Product[] {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return sortedProducts(index)
  // Reuse the typeahead's per-word label/alias matcher (productMatchesWord
  // normalizes each word), so the two searches can never drift; unlike the
  // typeahead this matches from the first character — a filter, not a fill.
  return index.products
    .filter((p) => words.every((w) => productMatchesWord(p, w)))
    .sort(byLabel)
}

/**
 * Same-kind Products other than the survivor — the only merge targets (a
 * cross-kind merge needs a grams-per-piece mapping and is out of v1, so no
 * surface ever offers it). Shared by the Glossary screen and the add card's
 * long-press card (#73).
 */
export function sameKindOthers(
  products: Product[],
  survivor: Product
): Product[] {
  return products
    .filter((p) => p.kind === survivor.kind && p.key !== survivor.key)
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    )
}

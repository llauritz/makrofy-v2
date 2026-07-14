// The history typeahead's pure core (ADR 0005, spec § Add flow, issue #18).
// Suggestions are served from an in-memory index derived at runtime from the
// full entry history — there is no favorites/history collection. Ranking is
// frecency (reuse count decayed by recency), dedup is by normalized label, and
// the search is sticky word-by-word. All of it is pure so the ranking maths and
// the sticky-search edges stay independent of Firestore and React (tested in
// tests/suggestions.test.ts).

import { parseLabel, type Quantity, type QuantityKind } from "./quantity"

// Tunables, all in one place (spec § Add flow): a word searches once it reaches
// MIN_WORD_CHARS, at most MAX_ROWS Suggestions show, and frecency decays with a
// ~3-week half-life so current habits outrank old ones.
export const MIN_WORD_CHARS = 2
export const MAX_ROWS = 4
export const HALF_LIFE_DAYS = 21

const DAY_MS = 86_400_000

/**
 * A history Entry reduced to what the index needs — nutrients plus the log time
 * as plain ms. The hook adapts a Firestore Entry (createdAt.toMillis()) into
 * this, keeping the index free of any Firestore type.
 */
export interface HistoryEntry {
  label: string
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
  /** When the Entry was logged, ms since epoch. */
  createdAtMs: number
}

// Per-unit rates whose ratio sits within this tolerance of a Reading's rate
// merge into that Reading instead of competing as their own (issue #37).
export const RATE_TOLERANCE = 0.05

/** A Reading's per-unit calories and macros — per gram, ml or count unit. */
export interface Rate {
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
}

/**
 * The freshest Entry attesting a Reading, as logged, plus its parsed Quantity
 * — the portion a scaled Suggestion scales from ("30g · 90") and the label and
 * numbers a baseline tap fills.
 */
export interface ReadingBase {
  label: string
  /** The Quantity token as logged ("30g"); "1" for a quantityless count. */
  quantityRaw: string
  /** Normalized magnitude (grams / ml / count units). */
  quantityValue: number
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
  createdAtMs: number
}

/**
 * One distinct per-unit value observed in a Product's Entry history
 * (CONTEXT.md). Readings compete: each surfaces as its own Suggestion row,
 * most-attested first, freshest breaking ties — an outvoted Reading is still
 * offered, never silently suppressed.
 */
export interface Reading {
  /** How many kcal-bearing Entries attest this value (the row's ×N). */
  votes: number
  rate: Rate
  base: ReadingBase
}

/**
 * A group of history Entries that are one food measured one way — same label
 * once the Quantity is stripped, same Quantity kind (CONTEXT.md). Carries its
 * competing Readings, its total use count and its frecency score. Enumerable
 * (with its Readings) for the Glossary browser to come (#40).
 */
export interface Product {
  /** The dedup key every Entry in the group shares: kind + stripped label. */
  key: string
  kind: QuantityKind
  /** The freshest Entry's label with its Quantity token stripped. */
  label: string
  /** Competing Readings, most-attested first; empty if nothing ever voted. */
  readings: Reading[]
  /** How many Entries attest this Product, voting or not. */
  useCount: number
  /** Frecency; higher ranks first. */
  score: number
  /** The freshest Entry as logged — what a Reading-less Product's row shows. */
  freshest: HistoryEntry
}

export interface ProductIndex {
  /** Every Product, frecency-ranked. Enumerable for the Glossary (#37). */
  products: Product[]
}

/** The index before any history has loaded (or for a signed-out app). */
export const EMPTY_INDEX: ProductIndex = { products: [] }

// A use's contribution to frecency: 1 today, halving every HALF_LIFE_DAYS.
function decay(ageDays: number): number {
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
}

// A kcal-bearing Entry waiting to be bucketed into a Reading, with the
// Quantity its per-unit rate divides by (a quantityless label is count-1).
interface Voter {
  entry: HistoryEntry
  quantityRaw: string
  quantityValue: number
}

/**
 * Build the in-memory Product index from the full entry history (ADR 0005).
 * Each Entry's label splits into label + Quantity (the grammar, #37); Entries
 * collapse by stripped label + Quantity kind. Each group counts its uses, sums
 * a recency-decayed weight per use for the frecency score, and buckets its
 * kcal-bearing Entries into Readings by per-unit rate: rates within
 * RATE_TOLERANCE of a fresher one merge into its Reading (adding a vote),
 * anything further apart competes as its own. Products come out ranked
 * best-first; Readings most-attested-first, freshest breaking ties.
 */
export function buildProductIndex(
  entries: readonly HistoryEntry[],
  nowMs: number,
): ProductIndex {
  const groups = new Map<
    string,
    {
      kind: QuantityKind
      freshest: HistoryEntry
      freshestLabel: string
      useCount: number
      score: number
      voters: Voter[]
    }
  >()
  for (const e of entries) {
    const { label, quantity } = parseLabel(e.label)
    const kind = quantity?.kind ?? "count"
    const key = `${kind}:${dedupKey(label)}`
    // Clamp future skew (an estimated server timestamp can read slightly ahead)
    // to "now" so it never scores above a genuine present-day use.
    const ageDays = Math.max(0, (nowMs - e.createdAtMs) / DAY_MS)
    const weight = decay(ageDays)
    let g = groups.get(key)
    if (!g) {
      g = {
        kind,
        freshest: e,
        freshestLabel: label,
        useCount: 0,
        score: 0,
        voters: [],
      }
      groups.set(key, g)
    }
    g.useCount += 1
    g.score += weight
    if (e.createdAtMs > g.freshest.createdAtMs) {
      g.freshest = e
      g.freshestLabel = label
    }
    if (e.kcal > 0) {
      g.voters.push({
        entry: e,
        quantityRaw: quantity?.raw ?? "1",
        quantityValue: quantity?.value ?? 1,
      })
    }
  }

  const products = [...groups].map(([key, g]) => ({
    key,
    kind: g.kind,
    // Display label: dropping the trailing punctuation a stripped Quantity
    // leaves behind ("Banana, 30g" → "Banana," → "Banana").
    label: g.freshestLabel.replace(TRAILING_PUNCTUATION, ""),
    readings: bucketReadings(g.voters),
    useCount: g.useCount,
    score: g.score,
    freshest: g.freshest,
  }))
  products.sort((a, b) => b.score - a.score)
  return { products }
}

// Fold one Product's voters into Readings. Freshest-first, so each Reading is
// anchored on (and shows) the freshest Entry attesting it; older votes within
// RATE_TOLERANCE of that anchor's per-unit rate pile onto it.
function bucketReadings(voters: Voter[]): Reading[] {
  const sorted = [...voters].sort(
    (a, b) => b.entry.createdAtMs - a.entry.createdAtMs,
  )
  const readings: Reading[] = []
  for (const v of sorted) {
    const rate = v.entry.kcal / v.quantityValue
    const home = readings.find(
      (r) => Math.abs(rate - r.rate.kcal) <= r.rate.kcal * RATE_TOLERANCE,
    )
    if (home) {
      home.votes += 1
      continue
    }
    const perUnit = (n: number | undefined) =>
      n === undefined ? undefined : n / v.quantityValue
    readings.push({
      votes: 1,
      rate: {
        kcal: rate,
        protein: perUnit(v.entry.protein),
        fat: perUnit(v.entry.fat),
        carbs: perUnit(v.entry.carbs),
      },
      base: {
        label: v.entry.label,
        quantityRaw: v.quantityRaw,
        quantityValue: v.quantityValue,
        kcal: v.entry.kcal,
        protein: v.entry.protein,
        fat: v.entry.fat,
        carbs: v.entry.carbs,
        createdAtMs: v.entry.createdAtMs,
      },
    })
  }
  // Freshest-first insertion makes the sort's tie-break free: equal votes stay
  // in insertion (freshness) order only if the sort is stable — Array.sort is.
  readings.sort((a, b) => b.votes - a.votes)
  return readings
}

/**
 * The word the user is currently typing — the last whitespace-delimited token
 * of the raw input, which becomes "" the instant a space begins the next word.
 * Only this word searches (spec § Add flow); the words before it are context
 * the user has moved past.
 */
export function currentSearchWord(input: string): string {
  return input.split(/\s+/).pop() ?? ""
}

/**
 * The Products matching one search word: those whose stripped label contains a
 * word the search word prefixes (so "brea" finds "chicken breast"),
 * frecency-ranked and capped at MAX_ROWS. Below MIN_WORD_CHARS nothing
 * searches — the caller keeps whatever was showing (see the sticky reducer).
 * Matching is label-only: a typed Quantity never filters (its unit-boost is a
 * reordering, applied by advanceSuggestions).
 */
export function matchProducts(index: ProductIndex, word: string): Product[] {
  const w = word.toLowerCase()
  if (w.length < MIN_WORD_CHARS) return []
  return index.products
    .filter((p) =>
      p.label
        .toLowerCase()
        .split(/\s+/)
        .some((token) => token.startsWith(w)),
    )
    .slice(0, MAX_ROWS)
}

/**
 * One Suggestion on screen — a Reading offered against the typed input (#37).
 * Competing Readings of one Product appear as adjacent rows. `fillLabel`
 * present = the #18 baseline (no Quantity typed): a tap fills that historical
 * label with its unscaled numbers. Absent = the typed label is the truth: a
 * tap fills numbers only, and `hint` names the portion they scaled from.
 */
export interface SuggestionRow {
  key: string
  label: string
  /** Votes for this row's Reading (every use, for a Reading-less Product). */
  useCount: number
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
  /** The scaled row's base portion, "30g · 90". */
  hint?: string
  fillLabel?: string
}

/** The rows on screen and the search word they answer to. */
export interface SuggestState {
  word: string
  rows: SuggestionRow[]
}

/** Nothing typed, nothing shown — the resting state. */
export const EMPTY_SUGGESTIONS: SuggestState = { word: "", rows: [] }

/**
 * Fold one input change into the sticky word-by-word search (spec § Add flow).
 * The word being typed searches; while it is too short or matches nothing the
 * previous rows stay put (returned by reference, so React skips the
 * re-render), and they are replaced only the moment a word produces matches.
 * A typed Quantity scales every matched Product's Readings live — matching
 * stays label-only — so editing "30g" to "60g" after a fill surfaces the
 * rescaled row for its second tap. An empty input clears everything.
 */
export function advanceSuggestions(
  prev: SuggestState,
  input: string,
  index: ProductIndex,
): SuggestState {
  if (input.trim() === "") return EMPTY_SUGGESTIONS
  const { label, quantity } = parseLabel(input)
  // The stripped label's last word is the one being typed — so "Banana 4"
  // keeps searching "Banana" while the Quantity grows. A trailing space still
  // means the next word hasn't started (nothing searches; rows stick).
  const word = /\s$/.test(input) ? "" : currentSearchWord(label)
  const products = rankForQuantity(matchProducts(index, word), quantity)
  const rows = products
    .flatMap((p) => productRows(p, quantity))
    .slice(0, MAX_ROWS)
  return rows.length > 0 ? { word, rows } : prev
}

// A typed unit boosts same-kind Products to the front of the ranking — it
// never filters, and frecency order survives within each part (spec § Add
// flow, #37). A bare number carries no unit and boosts nothing.
function rankForQuantity(
  products: Product[],
  typed: Quantity | null,
): Product[] {
  if (!typed || typed.kind === "count") return products
  return [
    ...products.filter((p) => p.kind === typed.kind),
    ...products.filter((p) => p.kind !== typed.kind),
  ]
}

// One Product's Suggestion rows — its Readings, competing in their
// most-attested order. With a Quantity typed, every present number scales by
// the Reading's rate (kcal to the nearest integer, macros to one decimal) and
// blanks stay blank; the typed number reads in the Product's own unit when
// the kinds differ (matching is unit-blind). A Reading-less Product has no
// Rate to scale by, so its row is always the unscaled freshest Entry.
function productRows(
  product: Product,
  typed: Quantity | null,
): SuggestionRow[] {
  if (product.readings.length === 0) {
    const e = product.freshest
    return [
      {
        key: product.key,
        label: e.label,
        useCount: product.useCount,
        kcal: e.kcal,
        protein: e.protein,
        fat: e.fat,
        carbs: e.carbs,
        fillLabel: typed ? undefined : e.label,
      },
    ]
  }
  return product.readings.map((r, i) => {
    const key = `${product.key}#${i}`
    if (!typed) {
      return {
        key,
        label: r.base.label,
        useCount: r.votes,
        kcal: r.base.kcal,
        protein: r.base.protein,
        fat: r.base.fat,
        carbs: r.base.carbs,
        fillLabel: r.base.label,
      }
    }
    const v = typed.kind === product.kind ? typed.value : typed.number
    const scale = (n: number | undefined) =>
      n === undefined ? undefined : Math.round(n * v * 10) / 10
    return {
      key,
      label: `${product.label} ${typed.raw}`,
      useCount: r.votes,
      kcal: Math.round(r.rate.kcal * v),
      protein: scale(r.rate.protein),
      fat: scale(r.rate.fat),
      carbs: scale(r.rate.carbs),
      hint: `${r.base.quantityRaw} · ${r.base.kcal}`,
    }
  })
}

const TRAILING_PUNCTUATION = /[\s\p{P}]+$/u

/**
 * The one point where a label becomes text a Product can be keyed on —
 * lower-cased, whitespace-collapsed, trailing punctuation dropped. The
 * Quantity grammar strips the amount before this runs (buildProductIndex), so
 * two Entries whose stripped labels share a key — and whose Quantity kinds
 * match — are the same Product (CONTEXT.md).
 */
export function dedupKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(TRAILING_PUNCTUATION, "")
}

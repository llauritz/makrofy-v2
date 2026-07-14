// The history typeahead's pure core (ADR 0005, spec § Add flow, issue #18).
// Suggestions are served from an in-memory index derived at runtime from the
// full entry history — there is no favorites/history collection. Ranking is
// frecency (reuse count decayed by recency), dedup is by normalized label, and
// the search is sticky word-by-word. All of it is pure so the ranking maths and
// the sticky-search edges stay independent of Firestore and React (tested in
// tests/suggestions.test.ts).

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

/**
 * A deduped group of history Entries — one food measured one way (CONTEXT.md).
 * Carries the freshest Entry's numbers (what a tap fills), how many uses attest
 * it, and its frecency score. #37 hangs per-unit Rate data off this same shape
 * and enumerates the products for the Glossary browser — hence a Product type
 * and an enumerable index rather than a bare search function.
 */
export interface Product {
  /** The dedup key every Entry in the group shares. */
  key: string
  /** The freshest Entry's label — shown on the Suggestion row. */
  label: string
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
  /** How many Entries attest this Product (the ×use-count). */
  useCount: number
  /** Frecency; higher ranks first. */
  score: number
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

/**
 * Build the in-memory Product index from the full entry history (ADR 0005).
 * Entries collapse by dedupKey; each group keeps the freshest Entry's label and
 * nutrients, counts its uses, and sums a recency-decayed weight per use for the
 * frecency score. Products come out ranked best-first.
 */
export function buildProductIndex(
  entries: readonly HistoryEntry[],
  nowMs: number,
): ProductIndex {
  const groups = new Map<
    string,
    { freshest: HistoryEntry; useCount: number; score: number }
  >()
  for (const e of entries) {
    const key = dedupKey(e.label)
    // Clamp future skew (an estimated server timestamp can read slightly ahead)
    // to "now" so it never scores above a genuine present-day use.
    const ageDays = Math.max(0, (nowMs - e.createdAtMs) / DAY_MS)
    const weight = decay(ageDays)
    const g = groups.get(key)
    if (!g) {
      groups.set(key, { freshest: e, useCount: 1, score: weight })
    } else {
      g.useCount += 1
      g.score += weight
      if (e.createdAtMs > g.freshest.createdAtMs) g.freshest = e
    }
  }

  const products = [...groups].map(([key, g]) => ({
    key,
    label: g.freshest.label,
    kcal: g.freshest.kcal,
    protein: g.freshest.protein,
    fat: g.freshest.fat,
    carbs: g.freshest.carbs,
    useCount: g.useCount,
    score: g.score,
  }))
  products.sort((a, b) => b.score - a.score)
  return { products }
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
 * The Suggestions for one search word: Products whose label contains a word the
 * search word prefixes (so "brea" finds "chicken breast"), frecency-ranked and
 * capped at MAX_ROWS. Below MIN_WORD_CHARS nothing searches — the caller keeps
 * whatever was showing (see the sticky reducer). Matching is label-only here;
 * the typed Quantity's unit-boost is #37's to add, and it only reorders, never
 * filters.
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

/** The rows on screen and the search word they answer to. */
export interface SuggestState {
  word: string
  rows: Product[]
}

/** Nothing typed, nothing shown — the resting state. */
export const EMPTY_SUGGESTIONS: SuggestState = { word: "", rows: [] }

/**
 * Fold one input change into the sticky word-by-word search (spec § Add flow).
 * The word being typed searches; while it is too short or matches nothing the
 * previous word's rows stay put (returned by reference, so React skips the
 * re-render), and they are replaced only the moment a word produces matches.
 * An empty input clears everything.
 */
export function advanceSuggestions(
  prev: SuggestState,
  input: string,
  index: ProductIndex,
): SuggestState {
  if (input.trim() === "") return EMPTY_SUGGESTIONS
  const word = currentSearchWord(input)
  const rows = matchProducts(index, word)
  return rows.length > 0 ? { word, rows } : prev
}

/**
 * The one point where a label becomes a Product's dedup key — lower-cased,
 * whitespace-collapsed, trailing punctuation dropped. Two Entries whose labels
 * share a key are the same Product (CONTEXT.md) and collapse into one
 * Suggestion. Kept deliberately as the single normalization step so the
 * Quantity grammar (#37) can later strip amounts here, before dedup, without
 * disturbing the rest of the index.
 */
export function dedupKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s\p{P}]+$/u, "")
}

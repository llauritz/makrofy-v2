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
 * Calories and macros, kcal always present (0 = blank) and macros only when
 * logged — the shape an Entry carries, a Reading's per-unit rate reuses, and
 * a Suggestion row displays and fills.
 */
export interface Nutrients {
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
}

/**
 * A history Entry reduced to what the index needs — nutrients plus the log time
 * as plain ms. The hook adapts a Firestore Entry (createdAt.toMillis()) into
 * this, keeping the index free of any Firestore type.
 */
export interface HistoryEntry extends Nutrients {
  label: string
  /** When the Entry was logged, ms since epoch. */
  createdAtMs: number
}

// Per-unit rates whose ratio sits within this tolerance of a Reading's rate
// merge into that Reading instead of competing as their own (issue #37).
export const RATE_TOLERANCE = 0.05

/**
 * A Reading's per-unit calories and macros — per gram, ml or count unit. The
 * top-ranked Reading's rate is the Product's Rate (CONTEXT.md).
 */
export type Rate = Nutrients

/**
 * The freshest Entry attesting a Reading, as logged, plus its parsed Quantity
 * — the portion a scaled Suggestion scales from ("30g · 90") and the label and
 * numbers a baseline tap fills.
 */
export interface ReadingBase extends Nutrients {
  label: string
  /** The Quantity token as logged ("30g"); "1" for a quantityless count. */
  quantityRaw: string
  /** Normalized magnitude (grams / ml / count units). */
  quantityValue: number
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
  /** Pinned as the Product's Rate regardless of votes, until unpinned (#40). */
  pinned?: boolean
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
  /** Labels absorbed into this Product by a merge; empty when unmerged (#40). */
  aliases: Alias[]
}

export interface ProductIndex {
  /** Every Product, frecency-ranked. Enumerable for the Glossary (#37). */
  products: Product[]
}

/** The index before any history has loaded (or for a signed-out app). */
export const EMPTY_INDEX: ProductIndex = { products: [] }

// ---------------------------------------------------------------------------
// The stored curation overlay (issue #40, ADR 0009). Logged Entries are
// untouchable, and the index stays derived (ADR 0005) — Glossary curation is
// stored as per-Product corrections in /users/{uid}/products/{key} and applied
// here as the derivation's final step. All timestamps are plain ms so the core
// stays Firestore-free.
// ---------------------------------------------------------------------------

/**
 * One stored Reading correction: past votes whose per-unit kcal rate sits
 * within RATE_TOLERANCE of `from` now attest `rate` instead — the Reading
 * keeps its votes and its tiebreak freshens to the edit (CONTEXT.md
 * "Reading"). `from: null` seeds a fresh ×1 Reading on a rate-less Product.
 */
export interface ReadingEdit {
  from: number | null
  /** The corrected per-unit value the votes now attest. */
  rate: Rate
  atMs: number
}

/**
 * One stored Reading deletion: past votes at ~`from` are silenced. A future
 * Entry re-attests the same value as a fresh ×1 Reading (CONTEXT.md).
 */
export interface ReadingDeletion {
  from: number
  atMs: number
}

/**
 * A label absorbed into another Product by a merge — a live mapping: Entries
 * under the absorbed key (past and future) count toward the survivor
 * (CONTEXT.md "Alias"). Removing the Alias unmerges.
 */
export interface Alias {
  /** The absorbed Product's key. */
  key: string
  /** The absorbed Product's display label at merge time, for the detail view. */
  label: string
  atMs: number
}

/** The stored curation overlay for one Product (issue #40, ADR 0009). */
export interface ProductOverlay {
  /** The Product key this overlay corrects — mirrors the doc id. */
  key: string
  edits?: ReadingEdit[]
  deletions?: ReadingDeletion[]
  /** The pinned Reading's per-unit kcal rate; that Reading is the Rate. */
  pinnedRate?: number
  aliases?: Alias[]
  /**
   * Timestamped forget (Product delete): Entries logged at or before this
   * never count; later Entries recreate the Product fresh.
   */
  deletedAtMs?: number
}

/** Every stored overlay, by Product key. */
export type OverlayMap = ReadonlyMap<string, ProductOverlay>

export const EMPTY_OVERLAYS: OverlayMap = new Map()

// A use's contribution to frecency: 1 today, halving every HALF_LIFE_DAYS.
function decay(ageDays: number): number {
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
}

// A quantityless label counts as a count of 1 (CONTEXT.md "Quantity").
const COUNT_OF_ONE: Quantity = { kind: "count", value: 1, numeral: 1, raw: "1" }

// A kcal-bearing Entry waiting to be folded into a Reading, with the Quantity
// its per-unit rate divides by.
interface Voter {
  entry: HistoryEntry
  quantity: Quantity
}

/**
 * Build the in-memory Product index from the full entry history (ADR 0005).
 * Each Entry's label splits into label + Quantity (the grammar, #37); Entries
 * collapse by stripped label + Quantity kind. Each group counts its uses, sums
 * a recency-decayed weight per use for the frecency score, and folds its
 * kcal-bearing Entries into Readings by per-unit rate: rates within
 * RATE_TOLERANCE of a fresher one merge into its Reading (adding a vote),
 * anything further apart competes as its own. Products come out ranked
 * best-first; Readings most-attested-first, freshest breaking ties.
 */
export function buildProductIndex(
  entries: readonly HistoryEntry[],
  nowMs: number,
  overlays: OverlayMap = EMPTY_OVERLAYS
): ProductIndex {
  // Merge mappings from the overlay: an absorbed key routes every one of its
  // Entries to the survivor's group (CONTEXT.md "Alias").
  const aliasToSurvivor = new Map<string, string>()
  for (const o of overlays.values()) {
    for (const a of o.aliases ?? []) aliasToSurvivor.set(a.key, o.key)
  }
  // The canonical stripped label per key — the freshest label among the Entries
  // natively keyed there. A survivor keeps its own label; an absorbed typo
  // never contributes one, so it can never resurface.
  const canonicalLabel = new Map<string, { label: string; ms: number }>()
  for (const e of entries) {
    const { label, quantity } = parseLabel(e.label)
    const key = `${quantity?.kind ?? "count"}:${dedupKey(label)}`
    const cur = canonicalLabel.get(key)
    if (!cur || e.createdAtMs > cur.ms) {
      canonicalLabel.set(key, { label, ms: e.createdAtMs })
    }
  }

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
    const naturalKey = `${kind}:${dedupKey(label)}`
    const key = aliasToSurvivor.get(naturalKey) ?? naturalKey
    // A Product delete is a timestamped forget (CONTEXT.md "Glossary"): every
    // Entry at or before the delete drops out entirely — it never counts, votes
    // or resurrects the Product. Only Entries logged afterwards remain, and they
    // rebuild it fresh (all its prior overlay corrections gate themselves out,
    // and the data layer cleared them on delete anyway).
    const deletedAtMs = overlays.get(key)?.deletedAtMs
    if (deletedAtMs !== undefined && e.createdAtMs <= deletedAtMs) continue
    // An absorbed Entry takes on the survivor's canonical label (keeping its
    // own Quantity token), so counts and Readings pool under the survivor while
    // the typo never shows anywhere — including a no-Quantity tap-fill.
    const absorbed = key !== naturalKey
    const strippedLabel = absorbed
      ? (canonicalLabel.get(key)?.label ?? label)
      : label
    const eff: HistoryEntry = absorbed
      ? {
          ...e,
          label: quantity ? `${strippedLabel} ${quantity.raw}` : strippedLabel,
        }
      : e
    // Clamp future skew (an estimated server timestamp can read slightly ahead)
    // to "now" so it never scores above a genuine present-day use.
    const ageDays = Math.max(0, (nowMs - e.createdAtMs) / DAY_MS)
    const weight = decay(ageDays)
    let g = groups.get(key)
    if (!g) {
      g = {
        kind,
        freshest: eff,
        freshestLabel: strippedLabel,
        useCount: 0,
        score: 0,
        voters: [],
      }
      groups.set(key, g)
    }
    g.useCount += 1
    g.score += weight
    if (eff.createdAtMs > g.freshest.createdAtMs) {
      g.freshest = eff
      g.freshestLabel = strippedLabel
    }
    if (eff.kcal > 0) {
      g.voters.push({ entry: eff, quantity: quantity ?? COUNT_OF_ONE })
    }
  }

  const products = [...groups].map(([key, g]) => {
    const overlay = overlays.get(key)
    return {
      key,
      kind: g.kind,
      // Display label: dropping the trailing punctuation a stripped Quantity
      // leaves behind ("Banana, 30g" → "Banana," → "Banana").
      label: g.freshestLabel.replace(TRAILING_PUNCTUATION, ""),
      readings: applyPin(
        deriveReadings(applyReadingOverlay(g.voters, overlay, g.freshestLabel)),
        overlay?.pinnedRate
      ),
      useCount: g.useCount,
      score: g.score,
      freshest: g.freshest,
      aliases: overlay?.aliases ?? [],
    }
  })
  products.sort((a, b) => b.score - a.score)
  return { products }
}

// Fold a Product's stored Reading corrections (issue #40) into its voters
// before they are folded into Readings. Deletions silence the votes they
// cover; edits rewrite theirs to the new value and freshen the tiebreak; a
// from-null edit seeds one fresh ×1 voter (the rate-less Product finally
// getting a value). A correction only reaches votes logged at or before it —
// a later Entry at the old value is a fresh observation it never touches.
function applyReadingOverlay(
  voters: Voter[],
  overlay: ProductOverlay | undefined,
  freshestLabel: string
): Voter[] {
  if (!overlay) return voters
  let result = voters
  for (const del of overlay.deletions ?? []) {
    result = result.filter(
      (v) =>
        !(
          v.entry.createdAtMs <= del.atMs &&
          Math.abs(perUnitKcal(v) - del.from) <= del.from * RATE_TOLERANCE
        )
    )
  }
  for (const edit of overlay.edits ?? []) {
    if (edit.from === null) {
      result = [...result, syntheticVoter(edit.rate, edit.atMs, freshestLabel)]
      continue
    }
    const from = edit.from
    result = result.map((v) =>
      v.entry.createdAtMs <= edit.atMs &&
      Math.abs(perUnitKcal(v) - from) <= from * RATE_TOLERANCE
        ? rewriteVoter(v, edit.rate, edit.atMs)
        : v
    )
  }
  return result
}

const perUnitKcal = (v: Voter): number => v.entry.kcal / v.quantity.value

// A Pin forces one Reading to be the Product's Rate regardless of votes
// (CONTEXT.md "Pin"): the Reading whose rate matches is flagged and lifted to
// the front, the outvoted Readings staying visible beneath it. No pin, or a
// pin whose Reading no longer exists (its votes edited/deleted away), leaves
// the vote order untouched.
function applyPin(
  readings: Reading[],
  pinnedRate: number | undefined
): Reading[] {
  if (pinnedRate === undefined) return readings
  const pinnedIndex = readings.findIndex(
    (r) => Math.abs(r.rate.kcal - pinnedRate) <= pinnedRate * RATE_TOLERANCE
  )
  if (pinnedIndex < 0) return readings
  const pinned = { ...readings[pinnedIndex], pinned: true }
  return [
    pinned,
    ...readings.slice(0, pinnedIndex),
    ...readings.slice(pinnedIndex + 1),
  ]
}

// A voter carrying a corrected per-unit rate: the portion (quantity) is kept,
// the numbers are the rate scaled back up to it, and the log time freshens to
// the edit so the Reading sorts as the freshest of its vote count.
function rewriteVoter(v: Voter, rate: Rate, atMs: number): Voter {
  const up = (n: number | undefined) =>
    n === undefined ? undefined : n * v.quantity.value
  return {
    quantity: v.quantity,
    entry: {
      label: v.entry.label,
      kcal: rate.kcal * v.quantity.value,
      protein: up(rate.protein),
      fat: up(rate.fat),
      carbs: up(rate.carbs),
      createdAtMs: atMs,
    },
  }
}

// A ×1 voter for a from-null edit: the rate as a single-unit portion, labelled
// with the Product's freshest label so a baseline Suggestion can still fill it.
function syntheticVoter(rate: Rate, atMs: number, label: string): Voter {
  return {
    quantity: COUNT_OF_ONE,
    entry: {
      label,
      kcal: rate.kcal,
      protein: rate.protein,
      fat: rate.fat,
      carbs: rate.carbs,
      createdAtMs: atMs,
    },
  }
}

// Fold one Product's voters into Readings. Freshest-first, so each Reading is
// anchored on (and shows) the freshest Entry attesting it; older votes within
// RATE_TOLERANCE of that anchor's per-unit rate pile onto it.
function deriveReadings(voters: Voter[]): Reading[] {
  const sorted = [...voters].sort(
    (a, b) => b.entry.createdAtMs - a.entry.createdAtMs
  )
  const readings: Reading[] = []
  for (const v of sorted) {
    const rate = v.entry.kcal / v.quantity.value
    const home = readings.find(
      (r) => Math.abs(rate - r.rate.kcal) <= r.rate.kcal * RATE_TOLERANCE
    )
    if (home) {
      home.votes += 1
      continue
    }
    const perUnit = (n: number | undefined) =>
      n === undefined ? undefined : n / v.quantity.value
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
        quantityRaw: v.quantity.raw,
        quantityValue: v.quantity.value,
        kcal: v.entry.kcal,
        protein: v.entry.protein,
        fat: v.entry.fat,
        carbs: v.entry.carbs,
        createdAtMs: v.entry.createdAtMs,
      },
    })
  }
  // Most-attested first, freshness breaking ties — each base is the freshest
  // Entry of its Reading, so its log time is the Reading's.
  readings.sort(
    (a, b) => b.votes - a.votes || b.base.createdAtMs - a.base.createdAtMs
  )
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
 * Every Product matching one search word: those whose stripped label contains
 * a word the search word prefixes (so "brea" finds "chicken breast"),
 * frecency-ranked. An absorbed label matches too — typing a merged-away typo
 * still surfaces its survivor (CONTEXT.md "Alias"). The word normalizes the way
 * Product labels did — lower-cased, trailing punctuation dropped — so retyping
 * "Banana," still finds Banana. Below MIN_WORD_CHARS nothing searches — the
 * caller keeps whatever was showing (see the sticky reducer). Matching is
 * label-only, and nothing caps here: a typed Quantity never filters, and its
 * unit-boost must be able to lift a Product into view before advanceSuggestions
 * trims to MAX_ROWS.
 */
export function matchProducts(index: ProductIndex, word: string): Product[] {
  const w = word.toLowerCase().replace(TRAILING_PUNCTUATION, "")
  if (w.length < MIN_WORD_CHARS) return []
  return index.products.filter((p) => productMatchesWord(p, word))
}

/**
 * Whether one search word prefixes any word of a Product's label or of one of
 * its absorbed alias labels — the shared label/alias matcher behind both the
 * typeahead (matchProducts) and the Glossary search (searchGlossary), so the
 * two can never drift. The word normalizes the way Product labels did (lower-
 * cased, trailing punctuation dropped), so retyping "Banana," still matches.
 */
export function productMatchesWord(product: Product, word: string): boolean {
  const w = word.toLowerCase().replace(TRAILING_PUNCTUATION, "")
  if (w === "") return false
  return (
    labelHasPrefix(product.label, w) ||
    product.aliases.some((a) => labelHasPrefix(a.label, w))
  )
}

// Whether any whitespace-delimited word of a label starts with the search word.
function labelHasPrefix(label: string, word: string): boolean {
  return label
    .toLowerCase()
    .split(/\s+/)
    .some((token) => token.startsWith(word))
}

/**
 * One Suggestion on screen — a Reading offered against the typed input (#37).
 * Competing Readings of one Product appear as adjacent rows. `fillLabel`
 * present = the #18 baseline (no Quantity typed): a tap fills that historical
 * label with its unscaled numbers. Absent = the typed label is the truth: a
 * tap fills numbers only, and `hint` names the portion they scaled from.
 */
export interface SuggestionRow extends Nutrients {
  key: string
  /** The backing Product — the long-press curation card looks it up by this. */
  productKey: string
  label: string
  /** Votes for this row's Reading (every use, for a Reading-less Product). */
  useCount: number
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
  index: ProductIndex
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
  typed: Quantity | null
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
  typed: Quantity | null
): SuggestionRow[] {
  if (product.readings.length === 0) {
    const e = product.freshest
    return [
      {
        key: product.key,
        productKey: product.key,
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
        productKey: product.key,
        label: r.base.label,
        useCount: r.votes,
        kcal: r.base.kcal,
        protein: r.base.protein,
        fat: r.base.fat,
        carbs: r.base.carbs,
        fillLabel: r.base.label,
      }
    }
    const v = typed.kind === product.kind ? typed.value : typed.numeral
    const scale = (n: number | undefined) =>
      n === undefined ? undefined : Math.round(n * v * 10) / 10
    return {
      key,
      productKey: product.key,
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
 * Quantity grammar strips the Quantity before this runs (buildProductIndex),
 * so two Entries whose stripped labels share a key — and whose Quantity kinds
 * match — are the same Product (CONTEXT.md).
 */
export function dedupKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(TRAILING_PUNCTUATION, "")
}

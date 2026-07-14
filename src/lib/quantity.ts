// The Quantity grammar (issue #37, CONTEXT.md "Quantity"): how a raw Entry
// label — or the add card's typed text — splits into a label and an optional
// Quantity. A Quantity is one whitespace token, leading or trailing only: a
// number with an optional unit, or a bare number meaning a count. No number at
// all returns a null Quantity (the Suggestion index treats that as a count of
// 1). Pure and UI-free, like the Suggestion core it feeds.

export type QuantityKind = "mass" | "volume" | "count"

export interface Quantity {
  kind: QuantityKind
  /** Normalized magnitude: grams for mass, ml for volume, units for count. */
  value: number
  /**
   * The numeral as typed, before unit normalization ("0.03kg" → 0.03). When a
   * Quantity meets a Product of another kind — matching is unit-blind, a unit
   * boosts but never filters — this is the magnitude that scales it.
   */
  numeral: number
  /** The token as typed (trailing punctuation dropped) — for row display. */
  raw: string
}

export interface ParsedLabel {
  /** The label with the Quantity token removed (whitespace collapsed). */
  label: string
  quantity: Quantity | null
}

// The tunable units table (spec § Add flow): token suffix → kind and the
// factor onto the kind's base unit (grams / ml). Counts have no unit.
const UNITS: Record<string, { kind: QuantityKind; factor: number }> = {
  g: { kind: "mass", factor: 1 },
  kg: { kind: "mass", factor: 1000 },
  ml: { kind: "volume", factor: 1 },
  l: { kind: "volume", factor: 1000 },
}

// One token as a Quantity: an integer or decimal (`.` or `,` directly between
// digits) plus an optional unit from the table.
const QUANTITY_TOKEN = /^(\d+(?:[.,]\d+)?)([a-z]+)?$/i

function parseToken(token: string): Quantity | null {
  // "2%"-style tokens are never Quantities (spec § Add flow) — checked before
  // the punctuation cleanup below would strip the sign off.
  if (token.includes("%")) return null
  const cleaned = token.replace(/[\p{P}]+$/u, "")
  const m = QUANTITY_TOKEN.exec(cleaned)
  if (!m) return null
  const numeral = Number(m[1].replace(",", "."))
  if (!(numeral > 0)) return null
  if (m[2] === undefined) {
    return { kind: "count", value: numeral, numeral, raw: cleaned }
  }
  const unit = UNITS[m[2].toLowerCase()]
  if (!unit) return null
  return {
    kind: unit.kind,
    value: numeral * unit.factor,
    numeral,
    raw: cleaned,
  }
}

/**
 * Split a raw label into its label text and Quantity. Only an edge token can
 * be a Quantity, and only when a label remains beside it — a lone "30g" is a
 * label, not a Quantity of nothing. When both ends parse, the unit-bearing
 * token wins, then the trailing one.
 */
export function parseLabel(raw: string): ParsedLabel {
  const tokens = raw.trim().split(/\s+/)
  if (tokens.length >= 2) {
    const leading = parseToken(tokens[0])
    const trailing = parseToken(tokens[tokens.length - 1])
    const leadingWins =
      leading && (!trailing || (leading.kind !== "count" && trailing.kind === "count"))
    const winner = leadingWins ? leading : trailing
    if (winner) {
      const rest = leadingWins ? tokens.slice(1) : tokens.slice(0, -1)
      return { label: rest.join(" "), quantity: winner }
    }
  }
  return { label: tokens.join(" "), quantity: null }
}

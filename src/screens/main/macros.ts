// Macro coding — fixed order P/F/C = blue/yellow/red (spec § Design direction).
// The colors are Warm Market tokens in index.css: `mark` paints chips, dots and
// tinted fills; `text` is the ≥4.5:1 text-grade variant for text on the card.
// `field` is the Entry key each macro reads/writes (ADR 0003 schema).

export const MACROS = [
  {
    key: "p",
    field: "protein",
    letter: "P",
    label: "Protein",
    mark: "var(--macro-p)",
    text: "var(--macro-p-text)",
  },
  {
    key: "f",
    field: "fat",
    letter: "F",
    label: "Fat",
    mark: "var(--macro-f)",
    text: "var(--macro-f-text)",
  },
  {
    key: "c",
    field: "carbs",
    letter: "C",
    label: "Carbs",
    mark: "var(--macro-c)",
    text: "var(--macro-c-text)",
  },
] as const

export type Macro = (typeof MACROS)[number]
/** The Entry field a macro maps to — 'protein' | 'fat' | 'carbs'. */
export type MacroField = Macro["field"]

/** A translucent wash of a macro mark color, for chip/pill backgrounds. */
export function macroTint(mark: string, percent: number) {
  return `color-mix(in oklab, ${mark} ${percent}%, transparent)`
}

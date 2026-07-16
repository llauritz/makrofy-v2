import type { EntryNutrients, FlaggableField } from "@/data/entries"
import { MACROS } from "./macros"

// Shared form plumbing for the add card and the inline editor: the P/F/C text
// inputs, keyed by MACRO.key, and how the raw strings become Entry numbers.

/** The three macro text fields, keyed 'p' | 'f' | 'c' (MACRO.key). */
export interface MacroInputs {
  p: string
  f: string
  c: string
}

export const EMPTY_MACROS: MacroInputs = { p: "", f: "", c: "" }

/**
 * The nutrients half of an Entry the form produces (the shared Entry shape),
 * plus the Flagged values an AI fill left unresolved at commit (ADR 0003 —
 * only the add card ever sets these; edits never touch them).
 */
export type EntryDraft = EntryNutrients & { flagged?: FlaggableField[] }

/** Blank → unset (an absent macro); non-numeric or negative is ignored. */
export function parseOptional(raw: string): number | undefined {
  const text = raw.trim()
  if (text === "") return undefined
  const n = Number(text)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Map the macro inputs onto their Entry fields (p→protein, f→fat, c→carbs). */
export function parseMacros(
  inputs: MacroInputs
): Pick<EntryDraft, "protein" | "fat" | "carbs"> {
  const out: Pick<EntryDraft, "protein" | "fat" | "carbs"> = {}
  for (const m of MACROS) out[m.field] = parseOptional(inputs[m.key])
  return out
}

/** Seed the macro inputs from an existing Entry's grams. */
export function macroInputsFrom(entry: {
  protein?: number
  fat?: number
  carbs?: number
}): MacroInputs {
  const str = (n: number | undefined) => (n === undefined ? "" : String(n))
  return { p: str(entry.protein), f: str(entry.fat), c: str(entry.carbs) }
}

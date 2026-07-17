import type { Language } from "@/lib/language"

import { en, type Dictionary } from "./en"
import { es } from "./es"

// The i18n barrel: the typed dictionaries, the language → dictionary lookup, and
// the locale-aware formatters (spec § i18n, issue #25). English is the source of
// truth (`Dictionary = typeof en`); a new language is one new module registered
// in DICTIONARIES below.

export type { Dictionary } from "./en"
export { formatNumber, localeFor } from "./format"

const DICTIONARIES: Record<Language, Dictionary> = { en, es }

/** The active language's dictionary. */
export function dictionaryFor(language: Language): Dictionary {
  return DICTIONARIES[language]
}

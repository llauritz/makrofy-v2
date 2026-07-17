import * as React from "react"

import { useLanguage } from "@/components/language-provider"
import { dictionaryFor, formatNumber, type Dictionary } from "@/lib/i18n"
import type { Language } from "@/lib/language"

// The one hook every screen reaches for: the active dictionary `t`, a number
// formatter `n` bound to the active language, and the language itself (for the
// few call sites that pass a locale on to a pure helper, e.g. the Day strip).
// Mirrors useTheme/useLanguage — it just layers the dictionaries and formatters
// (#25) on top of the language the LanguageProvider already tracks.

export interface I18n {
  language: Language
  t: Dictionary
  /** A displayed number in the active language's convention (spec § i18n). */
  n: (value: number) => string
}

export function useI18n(): I18n {
  const { language } = useLanguage()
  return React.useMemo(
    () => ({
      language,
      t: dictionaryFor(language),
      n: (value: number) => formatNumber(value, language),
    }),
    [language],
  )
}

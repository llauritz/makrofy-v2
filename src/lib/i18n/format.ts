import type { Language } from "@/lib/language"

// Locale-aware number/date formatting (spec § i18n: dates and numbers via Intl
// with the active locale). Pure and Firebase/React-free so the formatting rules
// stay testable in isolation (tests/i18n.test.ts).

/**
 * The BCP-47 locale an app language formats against. Both supported languages
 * are their own base tag, so the language code is the locale; a regional
 * variant would map here without touching call sites.
 */
export function localeFor(language: Language): string {
  return language
}

/**
 * A number in the active language's grouping and decimal convention — "1,234"
 * and "12.5" in English, "1234" and "12,5" in Spanish. The one place displayed
 * numbers are formatted, so the log never shows a mixed convention.
 */
export function formatNumber(value: number, language: Language): string {
  return value.toLocaleString(localeFor(language))
}

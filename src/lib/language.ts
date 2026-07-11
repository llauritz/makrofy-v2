// The app language, kept pure and device-local (spec § i18n): en + es only,
// English the source of truth. This module only decides *which* language is
// active; the typed dictionaries and the t() hook that translate against it
// arrive with #25. A stored device-local choice always wins; otherwise we take
// the first browser language we support; otherwise English.

export type Language = "en" | "es"

/** Supported languages, English first (the source of truth). */
export const LANGUAGES: readonly Language[] = ["en", "es"]

export const DEFAULT_LANGUAGE: Language = "en"

export function isLanguage(value: string | null | undefined): value is Language {
  return value != null && (LANGUAGES as readonly string[]).includes(value)
}

/**
 * Pick the language to start in from the stored device-local choice and the
 * browser's ordered language preferences (`navigator.languages`). Regional
 * tags match on their base subtag, so `en-GB` and `es-419` both count.
 */
export function resolveInitialLanguage(
  stored: string | null,
  navigatorLanguages: readonly string[],
): Language {
  if (isLanguage(stored)) return stored

  for (const tag of navigatorLanguages) {
    const base = tag.split("-")[0]?.toLowerCase()
    if (isLanguage(base)) return base
  }

  return DEFAULT_LANGUAGE
}

/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

import {
  DEFAULT_LANGUAGE,
  isLanguage,
  resolveInitialLanguage,
  type Language,
} from "@/lib/language"

// The active app language, held device-local like the theme (spec § i18n).
// This provider only tracks *which* language is chosen; #25 layers the typed
// dictionaries and the t() hook on top. Mirrors ThemeProvider: localStorage is
// the source of truth and a `storage` event keeps sibling tabs on this device
// in step.

type LanguageProviderState = {
  language: Language
  setLanguage: (language: Language) => void
}

const LanguageProviderContext = React.createContext<
  LanguageProviderState | undefined
>(undefined)

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return []
  if (navigator.languages && navigator.languages.length > 0) {
    return navigator.languages
  }
  return navigator.language ? [navigator.language] : []
}

export function LanguageProvider({
  children,
  storageKey = "language",
}: {
  children: React.ReactNode
  storageKey?: string
}) {
  const [language, setLanguageState] = React.useState<Language>(() =>
    resolveInitialLanguage(localStorage.getItem(storageKey), browserLanguages()),
  )

  const setLanguage = React.useCallback(
    (next: Language) => {
      localStorage.setItem(storageKey, next)
      setLanguageState(next)
    },
    [storageKey],
  )

  // Keep the document's lang attribute in step, for a11y and correct hyphenation.
  React.useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || event.key !== storageKey) {
        return
      }
      setLanguageState(
        isLanguage(event.newValue) ? event.newValue : DEFAULT_LANGUAGE,
      )
    }
    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [storageKey])

  const value = React.useMemo(
    () => ({ language, setLanguage }),
    [language, setLanguage],
  )

  return (
    <LanguageProviderContext.Provider value={value}>
      {children}
    </LanguageProviderContext.Provider>
  )
}

export const useLanguage = () => {
  const context = React.useContext(LanguageProviderContext)
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}

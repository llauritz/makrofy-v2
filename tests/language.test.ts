// Seam: choosing the app language (src/lib/language.ts). Language is
// device-local and defaults to the browser's, en + es only, English the source
// of truth (spec § i18n). The typed dictionaries + t() hook are #25's; this
// ticket only pins the choice — a stored device-local pick wins, otherwise the
// first browser language we support, otherwise English.
import { describe, expect, it } from "vitest"

import { isLanguage, resolveInitialLanguage } from "@/lib/language"

describe("isLanguage", () => {
  it("accepts the supported languages", () => {
    expect(isLanguage("en")).toBe(true)
    expect(isLanguage("es")).toBe(true)
  })

  it("rejects anything else", () => {
    expect(isLanguage("de")).toBe(false)
    expect(isLanguage("")).toBe(false)
    expect(isLanguage(null)).toBe(false)
    expect(isLanguage(undefined)).toBe(false)
  })
})

describe("resolveInitialLanguage", () => {
  it("honours a stored device-local choice over the browser", () => {
    expect(resolveInitialLanguage("es", ["en-US"])).toBe("es")
  })

  it("ignores a stored value that isn't a supported language", () => {
    expect(resolveInitialLanguage("de", ["es-ES"])).toBe("es")
  })

  it("falls back to the browser language when nothing is stored", () => {
    expect(resolveInitialLanguage(null, ["es-419"])).toBe("es")
  })

  it("matches a regional browser tag by its base subtag", () => {
    expect(resolveInitialLanguage(null, ["en-GB"])).toBe("en")
  })

  it("takes the first supported browser language in order", () => {
    expect(resolveInitialLanguage(null, ["fr-FR", "es", "en"])).toBe("es")
  })

  it("defaults to English when no browser language is supported", () => {
    expect(resolveInitialLanguage(null, ["fr-FR", "de"])).toBe("en")
  })

  it("defaults to English with no stored value and no browser languages", () => {
    expect(resolveInitialLanguage(null, [])).toBe("en")
  })
})

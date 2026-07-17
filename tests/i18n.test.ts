// Seam: the i18n core (src/lib/i18n). Two invariants matter here and are cheap
// to get wrong: numbers format in the active language's convention (spec §
// i18n), and the Spanish dictionary mirrors the English one exactly — English
// is the source of truth, so a drifted shape is a bug even though TypeScript
// also guards it at compile time. Tested independent of React.
import { describe, expect, it } from "vitest"

import { dictionaryFor, formatNumber, localeFor } from "@/lib/i18n"
import { en } from "@/lib/i18n/en"
import { es } from "@/lib/i18n/es"

describe("formatNumber", () => {
  it("uses each language's grouping and decimal convention", () => {
    // English groups thousands with commas and uses a decimal point; Spanish
    // groups with points and uses a decimal comma.
    expect(formatNumber(1234, "en")).toBe("1,234")
    expect(formatNumber(1_234_567, "en")).toBe("1,234,567")
    expect(formatNumber(12.5, "en")).toBe("12.5")

    expect(formatNumber(1_234_567, "es")).toBe("1.234.567")
    expect(formatNumber(12.5, "es")).toBe("12,5")
  })

  it("maps each language to its Intl locale", () => {
    expect(localeFor("en")).toBe("en")
    expect(localeFor("es")).toBe("es")
  })
})

describe("dictionaryFor", () => {
  it("returns the requested language's dictionary", () => {
    expect(dictionaryFor("en")).toBe(en)
    expect(dictionaryFor("es")).toBe(es)
  })
})

// The kind of each dictionary leaf, so two dictionaries can be compared by
// structure regardless of the actual words: a plain string, a function (with
// its argument count, so a signature change is caught), or a React node.
function kindOf(value: unknown): string {
  if (typeof value === "string") return "string"
  if (typeof value === "function") return `fn/${value.length}`
  if (value !== null && typeof value === "object" && "$$typeof" in value) {
    return "node"
  }
  return "object"
}

// Every leaf as a sorted "path:kind" list — the dictionary's shape, flattened.
function shape(dict: object, prefix = ""): string[] {
  const out: string[] = []
  for (const key of Object.keys(dict).sort()) {
    const value = (dict as Record<string, unknown>)[key]
    const path = prefix ? `${prefix}.${key}` : key
    if (
      value !== null &&
      typeof value === "object" &&
      !("$$typeof" in value)
    ) {
      out.push(...shape(value, path))
    } else {
      out.push(`${path}:${kindOf(value)}`)
    }
  }
  return out
}

describe("Spanish dictionary parity", () => {
  it("mirrors the English dictionary's shape exactly", () => {
    // Same keys, same leaf kinds, same function arities — no key missing, extra,
    // or turned from a string into a function (or vice versa).
    expect(shape(es)).toEqual(shape(en))
  })

  it("is actually translated, not a copy of English", () => {
    // Spot-check a few leaves so an accidentally-stubbed es (English strings
    // under Spanish keys) fails loudly.
    expect(es.common.undo).toBe("Deshacer")
    expect(es.header.settings).toBe("Ajustes")
    expect(es.addCard.placeholder).toBe("¿Qué comiste?")
    expect(es.summary.remaining("1.234")).toBe("Restante: 1.234")
  })

  it("keeps the language-toggle labels as endonyms in every dictionary", () => {
    // The toggle shows each language in its own language (spec § i18n:
    // "English / Español"), so these labels must be identical across
    // dictionaries — not translated per active language.
    expect(en.settings.languageEnglish).toBe("English")
    expect(en.settings.languageSpanish).toBe("Español")
    expect(es.settings.languageEnglish).toBe(en.settings.languageEnglish)
    expect(es.settings.languageSpanish).toBe(en.settings.languageSpanish)
  })
})

describe("glossary rate formatting", () => {
  // The Glossary Rate line and basis words used to live in glossary.ts; they are
  // user-facing copy, so they moved into the dictionary (#25). Their behaviour
  // is asserted here at the new seam, for both languages.
  it("formats a Rate line per basis in English", () => {
    expect(en.glossary.rateLine("78", "count")).toBe("78 kcal each")
    expect(en.glossary.rateLine("380", "mass")).toBe("380 kcal / 100 g")
    expect(en.glossary.rateLine("50", "volume")).toBe("50 kcal / 100 ml")
    expect(en.glossary.rateNone).toBe("—")
  })

  it("localizes the Rate line and basis words in Spanish", () => {
    expect(es.glossary.rateLine("78", "count")).toBe("78 kcal por unidad")
    expect(es.glossary.rateLine("380", "mass")).toBe("380 kcal / 100 g")
    expect(es.glossary.basis("count")).toBe("unidad")
    expect(en.glossary.basis("count")).toBe("each")
  })

  it("captions a Reading's kcal against its basis", () => {
    expect(en.glossary.kcalBasis("count")).toBe("kcal each")
    expect(en.glossary.kcalBasis("mass")).toBe("kcal / 100 g")
    expect(es.glossary.kcalBasis("count")).toBe("kcal por unidad")
  })
})

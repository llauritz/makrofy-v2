// Seam: the AI macro-fill domain module — the four-tier wire contract
// (spec § AI macro-fill, #21; schema + worked examples in
// docs/research/gemini-firebase-ai-logic-macro-fill.md). The model's JSON is
// untrusted: the flat schema can't express which fields belong to which
// status, so the tier rules are enforced here, client-side. No Firebase — the
// parser and mappings are pure so every tier is cheap to pin down.
import { describe, expect, it } from "vitest"

import {
  bindAttributionToTheme,
  capFinalRoundTrip,
  entryFillFrom,
  fillableFrom,
  fillNumbersFrom,
  fillValuesFrom,
  flaggedFieldsFrom,
  flagsFromUncertain,
  followUpPrompt,
  formFlagsFrom,
  interpretationOf,
  knownFromEntry,
  parseMacroFillResponse,
  promptFrom,
} from "@/lib/macro-fill"

// The research note's worked example for the confident tier ("10g butter").
const butter = {
  label: "Butter, salted",
  servingText: "10 g",
  grams: 10,
  calories: 72,
  protein_g: 0.1,
  carbs_g: 0.0,
  fat_g: 8.1,
}

describe("parseMacroFillResponse", () => {
  it("accepts the confident worked example", () => {
    const text = JSON.stringify({ status: "confident", food: butter })
    expect(parseMacroFillResponse(text)).toEqual({
      status: "confident",
      food: butter,
    })
  })

  it("rejects non-JSON text", () => {
    expect(parseMacroFillResponse("I couldn't estimate that.")).toBeNull()
  })

  it("rejects an unknown status", () => {
    const text = JSON.stringify({ status: "maybe", food: butter })
    expect(parseMacroFillResponse(text)).toBeNull()
  })

  it("rejects confident with no food payload", () => {
    expect(
      parseMacroFillResponse(JSON.stringify({ status: "confident" }))
    ).toBeNull()
  })

  // The research note's worked example for the unsure tier ("medium banana").
  const banana = {
    label: "Banana, raw",
    servingText: "1 medium (~118 g)",
    grams: 118,
    calories: 105,
    protein_g: 1.3,
    carbs_g: 27.0,
    fat_g: 0.4,
  }

  it("accepts the unsure worked example, keeping its uncertain fields", () => {
    const text = JSON.stringify({
      status: "unsure",
      food: banana,
      uncertainFields: ["grams", "calories"],
    })
    expect(parseMacroFillResponse(text)).toEqual({
      status: "unsure",
      food: banana,
      uncertainFields: ["grams", "calories"],
    })
  })

  it("drops unknown uncertain-field names", () => {
    const text = JSON.stringify({
      status: "unsure",
      food: banana,
      uncertainFields: ["calories", "vibes"],
    })
    expect(parseMacroFillResponse(text)).toEqual({
      status: "unsure",
      food: banana,
      uncertainFields: ["calories"],
    })
  })

  it("downgrades unsure with nothing actually uncertain to confident", () => {
    // The schema can't force uncertainFields alongside status "unsure"; an
    // unsure answer with no named field is a confident fill with no flags.
    const text = JSON.stringify({ status: "unsure", food: banana })
    expect(parseMacroFillResponse(text)).toEqual({
      status: "confident",
      food: banana,
    })
  })

  it("rejects a food with a non-finite or negative number", () => {
    const negative = JSON.stringify({
      status: "confident",
      food: { ...butter, calories: -5 },
    })
    expect(parseMacroFillResponse(negative)).toBeNull()
    const infinite = JSON.stringify({
      status: "confident",
      food: { ...butter, fat_g: Infinity },
    })
    expect(parseMacroFillResponse(infinite)).toBeNull()
  })

  it("treats a missing grams as null (not mass-based)", () => {
    const text = JSON.stringify({
      status: "confident",
      food: { ...butter, grams: undefined },
    })
    expect(parseMacroFillResponse(text)).toEqual({
      status: "confident",
      food: { ...butter, grams: null },
    })
  })

  it("accepts ambiguous: exactly one question plus its answer chips", () => {
    const text = JSON.stringify({
      status: "ambiguous",
      question: "Which cereal is it — and roughly how much?",
      answerChips: ["Cornflakes, 40 g", "Granola, 50 g", "Muesli, 60 g"],
    })
    expect(parseMacroFillResponse(text)).toEqual({
      status: "ambiguous",
      question: "Which cereal is it — and roughly how much?",
      answerChips: ["Cornflakes, 40 g", "Granola, 50 g", "Muesli, 60 g"],
    })
  })

  it("normalizes chips: trims, drops blanks and duplicates, caps at four", () => {
    const text = JSON.stringify({
      status: "ambiguous",
      question: "Which one?",
      answerChips: [" A ", "", "A", "B", "C", "D", "E"],
    })
    expect(parseMacroFillResponse(text)).toEqual({
      status: "ambiguous",
      question: "Which one?",
      answerChips: ["A", "B", "C", "D"],
    })
  })

  it("coerces ambiguous with no chips into a hopeless hint", () => {
    // The chips ARE the answer path (#5) — a chipless question would be
    // unanswerable in the zone, so it lands as a hint the user can act on
    // by folding the detail into their own description.
    const text = JSON.stringify({ status: "ambiguous", question: "Which one?" })
    expect(parseMacroFillResponse(text)).toEqual({
      status: "hopeless",
      hint: "Which one?",
    })
  })

  it("rejects ambiguous with no question", () => {
    expect(
      parseMacroFillResponse(JSON.stringify({ status: "ambiguous" }))
    ).toBeNull()
    expect(
      parseMacroFillResponse(
        JSON.stringify({ status: "ambiguous", question: "  " })
      )
    ).toBeNull()
  })

  it("accepts the hopeless worked example", () => {
    const hint =
      'Tell me the main ingredients and rough amounts, e.g. "200 g beef, 1 potato, 100 ml cream".'
    const text = JSON.stringify({ status: "hopeless", hint })
    expect(parseMacroFillResponse(text)).toEqual({ status: "hopeless", hint })
  })

  it("rejects hopeless with no hint", () => {
    expect(
      parseMacroFillResponse(JSON.stringify({ status: "hopeless" }))
    ).toBeNull()
  })
})

describe("capFinalRoundTrip", () => {
  // A chip answer is the second and FINAL round trip (#5, #21): a model that
  // comes back still ambiguous gets no third question — its question becomes
  // the hint, so the user can fold that detail into their own description.
  it("turns a second ambiguous answer into a hopeless hint", () => {
    expect(
      capFinalRoundTrip({
        status: "ambiguous",
        question: "Toasted or plain muesli?",
        answerChips: ["Toasted", "Plain"],
      })
    ).toEqual({ status: "hopeless", hint: "Toasted or plain muesli?" })
  })

  it("passes every other tier through untouched", () => {
    const confident = {
      status: "confident" as const,
      food: {
        label: "Muesli",
        servingText: "60 g",
        grams: 60,
        calories: 220,
        protein_g: 6,
        carbs_g: 40,
        fat_g: 4,
      },
    }
    expect(capFinalRoundTrip(confident)).toBe(confident)
    const hopeless = {
      status: "hopeless" as const,
      hint: "List the ingredients.",
    }
    expect(capFinalRoundTrip(hopeless)).toBe(hopeless)
  })
})

describe("flagsFromUncertain", () => {
  it("maps portion and calorie doubt onto the kcal field", () => {
    // servingText, grams and calories all say "the headline number is a
    // guess" — the kcal field is where that doubt is shown (#5 prototype).
    expect(flagsFromUncertain(["servingText"])).toEqual(new Set(["kcal"]))
    expect(flagsFromUncertain(["grams"])).toEqual(new Set(["kcal"]))
    expect(flagsFromUncertain(["calories"])).toEqual(new Set(["kcal"]))
  })

  it("maps each macro onto its own pill", () => {
    expect(flagsFromUncertain(["protein_g", "carbs_g", "fat_g"])).toEqual(
      new Set(["p", "c", "f"])
    )
  })
})

describe("flaggedFieldsFrom", () => {
  it("maps form flags onto the persisted Entry field names, in schema order", () => {
    // ADR 0003: flagged? is ('kcal'|'protein'|'fat'|'carbs')[].
    expect(flaggedFieldsFrom(new Set(["c", "kcal", "p", "f"]))).toEqual([
      "kcal",
      "protein",
      "fat",
      "carbs",
    ])
  })

  it("is empty for no flags", () => {
    expect(flaggedFieldsFrom(new Set())).toEqual([])
  })
})

describe("fillValuesFrom", () => {
  it("rounds kcal to a whole number and macros to one decimal", () => {
    const food = {
      label: "Granola",
      servingText: "50 g",
      grams: 50,
      calories: 230.4,
      protein_g: 5.04,
      carbs_g: 32,
      fat_g: 9.25,
    }
    expect(fillValuesFrom(food)).toEqual({
      kcal: "230",
      p: "5",
      f: "9.3",
      c: "32",
    })
  })
})

describe("interpretationOf", () => {
  it("reads label — serving", () => {
    const food = {
      label: "Butter, salted",
      servingText: "10 g",
      grams: 10,
      calories: 72,
      protein_g: 0.1,
      carbs_g: 0,
      fat_g: 8.1,
    }
    expect(interpretationOf(food)).toBe("Butter, salted — 10 g")
  })

  it("stands on the label alone when there is no serving text", () => {
    const food = {
      label: "Big Mac",
      servingText: " ",
      grams: null,
      calories: 563,
      protein_g: 26,
      carbs_g: 44,
      fat_g: 33,
    }
    expect(interpretationOf(food)).toBe("Big Mac")
  })
})

describe("bindAttributionToTheme", () => {
  // The shape Google ships in searchEntryPoint.renderedContent: one <style>
  // block carrying both variants behind prefers-color-scheme media queries.
  const html =
    "<style>" +
    "@media (prefers-color-scheme: light) { .container { background-color: #fafafa; } }\n" +
    "@media (prefers-color-scheme: dark) { .container { background-color: #1f1f1f; } }" +
    '</style><div class="container"></div>'

  it("pins the dark variant on and the light variant off for a dark app", () => {
    const bound = bindAttributionToTheme(html, "dark")
    expect(bound).toContain(
      "@media all { .container { background-color: #1f1f1f; } }"
    )
    expect(bound).toContain(
      "@media not all { .container { background-color: #fafafa; } }"
    )
    expect(bound).not.toContain("prefers-color-scheme")
  })

  it("pins the light variant on and the dark variant off for a light app", () => {
    const bound = bindAttributionToTheme(html, "light")
    expect(bound).toContain(
      "@media all { .container { background-color: #fafafa; } }"
    )
    expect(bound).toContain(
      "@media not all { .container { background-color: #1f1f1f; } }"
    )
  })

  it("leaves everything but the scheme queries untouched", () => {
    expect(bindAttributionToTheme(html, "dark")).toContain(
      '<div class="container"></div>'
    )
  })
})

describe("followUpPrompt", () => {
  it("carries the original description, the question, and the tapped answer", () => {
    const prompt = followUpPrompt(
      "bowl of cereal",
      "Which cereal is it — and roughly how much?",
      "Cornflakes, 40 g"
    )
    expect(prompt).toBe(
      'Food: "bowl of cereal"\n' +
        'Your clarifying question: "Which cereal is it — and roughly how much?"\n' +
        'The answer: "Cornflakes, 40 g"'
    )
  })
})

describe("knownFromEntry", () => {
  it("treats kcal 0 as not logged (the dashed-row rule), macros by presence", () => {
    expect(knownFromEntry({ kcal: 0, protein: 12 })).toEqual({ protein: 12 })
  })

  it("keeps a real kcal and an explicit 0-gram macro", () => {
    // 0 g fat is a logged value (black coffee), unlike 0 kcal which means
    // "no calorie info" per the Entry schema.
    expect(knownFromEntry({ kcal: 350, fat: 0 })).toEqual({ kcal: 350, fat: 0 })
  })
})

describe("fillableFrom", () => {
  it("offers every field when nothing is known", () => {
    expect(fillableFrom({})).toEqual(new Set(["kcal", "p", "f", "c"]))
  })

  it("offers only the fields without a value", () => {
    expect(fillableFrom({ kcal: 350 })).toEqual(new Set(["p", "f", "c"]))
    expect(fillableFrom({ protein: 12, fat: 0 })).toEqual(
      new Set(["kcal", "c"])
    )
  })

  it("is empty when everything is already filled", () => {
    expect(
      fillableFrom({ kcal: 350, protein: 12, fat: 5, carbs: 30 })
    ).toEqual(new Set())
  })
})

describe("promptFrom", () => {
  it("is the label alone when nothing is known", () => {
    expect(promptFrom("porridge", {})).toBe("porridge")
  })

  it("folds known values into the description so estimates anchor to them", () => {
    expect(promptFrom("porridge", { protein: 12 })).toBe(
      "porridge (12 g protein)"
    )
    expect(promptFrom("chicken salad", { kcal: 350 })).toBe(
      "chicken salad (350 kcal)"
    )
  })

  it("lists several known values in kcal, protein, fat, carbs order", () => {
    expect(
      promptFrom("smoothie", { carbs: 30, kcal: 320, protein: 12 })
    ).toBe("smoothie (320 kcal, 12 g protein, 30 g carbs)")
  })
})

describe("fillNumbersFrom", () => {
  it("rounds like the add-card strings: kcal whole, macros one decimal", () => {
    const food = {
      label: "Granola",
      servingText: "50 g",
      grams: 50,
      calories: 230.4,
      protein_g: 5.04,
      carbs_g: 32,
      fat_g: 9.25,
    }
    expect(fillNumbersFrom(food)).toEqual({
      kcal: 230,
      protein: 5,
      fat: 9.3,
      carbs: 32,
    })
  })
})

describe("entryFillFrom", () => {
  // The unsure worked example: the row fill's source food.
  const banana = {
    label: "Banana, raw",
    servingText: "1 medium (~118 g)",
    grams: 118,
    calories: 105,
    protein_g: 1.3,
    carbs_g: 27.0,
    fat_g: 0.4,
  }

  it("writes only the missing fields, never a logged value", () => {
    expect(entryFillFrom({ protein: 12 }, banana, [])).toEqual({
      kcal: 105,
      fat: 0.4,
      carbs: 27,
    })
  })

  it("keeps flags only for fields the fill actually wrote", () => {
    // protein is logged, so the model's protein doubt has nowhere to land;
    // calorie doubt lands on the kcal it wrote.
    expect(
      entryFillFrom({ protein: 12 }, banana, ["calories", "protein_g"])
    ).toEqual({
      kcal: 105,
      fat: 0.4,
      carbs: 27,
      flagged: ["kcal"],
    })
  })

  it("is empty when nothing is missing", () => {
    expect(
      entryFillFrom(
        { kcal: 100, protein: 1, fat: 0.5, carbs: 25 },
        banana,
        ["calories"]
      )
    ).toEqual({})
  })
})

describe("formFlagsFrom", () => {
  it("maps persisted flagged fields back onto their form flags", () => {
    expect(formFlagsFrom(["kcal", "fat"])).toEqual(new Set(["kcal", "f"]))
  })

  it("is empty for an Entry with no flags", () => {
    expect(formFlagsFrom(undefined)).toEqual(new Set())
  })
})

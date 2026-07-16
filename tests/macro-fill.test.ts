// Seam: the AI macro-fill domain module — the four-tier wire contract
// (spec § AI macro-fill, #21; schema + worked examples in
// docs/research/gemini-firebase-ai-logic-macro-fill.md). The model's JSON is
// untrusted: the flat schema can't express which fields belong to which
// status, so the tier rules are enforced here, client-side. No Firebase — the
// parser and mappings are pure so every tier is cheap to pin down.
import { describe, expect, it } from "vitest"

import {
  capFinalRoundTrip,
  fillValuesFrom,
  flaggedFieldsFrom,
  flagsFromUncertain,
  followUpPrompt,
  interpretationOf,
  parseMacroFillResponse,
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
    expect(parseMacroFillResponse(JSON.stringify({ status: "confident" }))).toBeNull()
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

  it("accepts ambiguous with no chips at all (the question stands alone)", () => {
    const text = JSON.stringify({ status: "ambiguous", question: "Which one?" })
    expect(parseMacroFillResponse(text)).toEqual({
      status: "ambiguous",
      question: "Which one?",
      answerChips: [],
    })
  })

  it("rejects ambiguous with no question", () => {
    expect(parseMacroFillResponse(JSON.stringify({ status: "ambiguous" }))).toBeNull()
    expect(
      parseMacroFillResponse(JSON.stringify({ status: "ambiguous", question: "  " })),
    ).toBeNull()
  })

  it("accepts the hopeless worked example", () => {
    const hint =
      'Tell me the main ingredients and rough amounts, e.g. "200 g beef, 1 potato, 100 ml cream".'
    const text = JSON.stringify({ status: "hopeless", hint })
    expect(parseMacroFillResponse(text)).toEqual({ status: "hopeless", hint })
  })

  it("rejects hopeless with no hint", () => {
    expect(parseMacroFillResponse(JSON.stringify({ status: "hopeless" }))).toBeNull()
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
      }),
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
    const hopeless = { status: "hopeless" as const, hint: "List the ingredients." }
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
      new Set(["p", "c", "f"]),
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
    expect(fillValuesFrom(food)).toEqual({ kcal: "230", p: "5", f: "9.3", c: "32" })
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

describe("followUpPrompt", () => {
  it("carries the original description, the question, and the tapped answer", () => {
    const prompt = followUpPrompt(
      "bowl of cereal",
      "Which cereal is it — and roughly how much?",
      "Cornflakes, 40 g",
    )
    expect(prompt).toBe(
      'Food: "bowl of cereal"\n' +
        'Your clarifying question: "Which cereal is it — and roughly how much?"\n' +
        'The answer: "Cornflakes, 40 g"',
    )
  })
})

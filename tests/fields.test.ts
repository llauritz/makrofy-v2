// Seam: the shared form plumbing for the add card and the inline editor —
// how the raw field strings become the KnownNutrients an AI fill on the
// editor anchors to and must not overwrite (#53). Pure, no Firebase.
import { describe, expect, it } from "vitest"

import { knownFromInputs } from "@/screens/main/fields"

describe("knownFromInputs", () => {
  it("knows nothing from blank fields", () => {
    expect(knownFromInputs("", { p: "", f: "", c: "" })).toEqual({})
  })

  it("treats kcal 0 or blank as unknown (the dashed-row rule)", () => {
    expect(knownFromInputs("0", { p: "", f: "", c: "" })).toEqual({})
  })

  it("keeps a typed kcal and macros, mapping p/f/c onto their Entry fields", () => {
    expect(knownFromInputs("350", { p: "12", f: "", c: "30" })).toEqual({
      kcal: 350,
      protein: 12,
      carbs: 30,
    })
  })

  it("keeps an explicit 0-gram macro (a logged value, unlike 0 kcal)", () => {
    expect(knownFromInputs("", { p: "0", f: "", c: "" })).toEqual({
      protein: 0,
    })
  })

  it("ignores non-numeric and negative text like the committing parser does", () => {
    expect(knownFromInputs("abc", { p: "-2", f: "5", c: "" })).toEqual({
      fat: 5,
    })
  })
})

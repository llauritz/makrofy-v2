// The food-table path (variant "table-jev"): find candidate foods in our own
// table by name, let Jev pick the food and the portion, and do the sums in
// code. Anything Jev isn't sure about is a miss, and the variant falls back
// to Gemini.
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { TABLE_SPEC } from "../data/food-table.spec.mjs"

const TABLE_FILE = join(dirname(fileURLToPath(import.meta.url)), "../data/food-table.json")

export function loadTable({ mock }) {
  if (existsSync(TABLE_FILE)) return JSON.parse(readFileSync(TABLE_FILE, "utf8"))
  if (!mock) return null
  // --mock without a built table: placeholder values so the plumbing runs.
  return {
    source: "MOCK placeholder values",
    foods: TABLE_SPEC.map((s) => ({
      id: s.id, names: s.names, density: s.density ?? null,
      per100: { kcal: 100, p: 5, f: 5, c: 10 },
      portions: s.portions ?? [{ label: "1 medium", grams: 100 }, { label: "1 large", grams: 150 }],
    })),
  }
}

export const norm = (s) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

const STOP = new Set("a an the of with and con de del la el los las y mit und ein eine einen un una g ml gr kg l".split(" "))
const tokens = (s) => norm(s).split(" ").filter((t) => t && !STOP.has(t) && !/^\d/.test(t))
// "eggs" ~ "egg", "Eier" ~ "Ei", "tomates" ~ "tomate": a shared 4-letter
// prefix, or one word containing the other.
const close = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a) || a.slice(0, 5) === b.slice(0, 5)))

/** Up to `max` table foods whose names share words with the entry. */
export function shortlist(table, text, max = 12) {
  const q = tokens(text)
  if (!q.length) return []
  const scored = table.foods.map((food) => {
    let best = 0
    for (const name of Object.values(food.names).flat()) {
      const n = tokens(name)
      const hits = n.filter((t) => q.some((w) => close(w, t))).length
      if (hits) best = Math.max(best, hits / n.length + hits * 0.01)
    }
    return { food, score: best }
  })
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, max).map((s) => s.food)
}

const WORD_COUNTS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, un: 1, una: 1, uno: 1, dos: 2, tres: 3,
  ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, half: 0.5, medio: 0.5, media: 0.5, halbe: 0.5, halber: 0.5,
}

/** "200 g" / "250 ml" / "0,5 l" → grams; else null. */
export function statedGrams(text, density) {
  const t = text.toLowerCase().replace(",", ".")
  let m = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|grams?|gramos?|gramm)\b/)
  if (m) return Number(m[1]) * (m[2] === "kg" ? 1000 : 1)
  m = t.match(/(\d+(?:\.\d+)?)\s*(ml|l|litros?|liter)\b/)
  if (m) return Number(m[1]) * (m[2] === "ml" ? 1 : 1000) * (density ?? 1)
  return null
}

/** Leading count: "2 eggs", "una manzana", "half an avocado"; default 1. */
export function statedCount(text) {
  const t = norm(text)
  const m = t.match(/^(\d+(?:\.\d+)?)\b/)
  if (m) return Number(m[1])
  const first = t.split(" ")[0]
  return WORD_COUNTS[first] ?? 1
}

const label = (f) => f.names.en[0]
const describe = (f) =>
  `${[...new Set(Object.values(f.names).flat())].join(" / ")} — ${f.per100.kcal} kcal per 100 g`

/**
 * Match one entry against the table with Jev. Returns { result, reason,
 * calls } where result is a MacroFillResult or null (a miss).
 */
export async function matchWithJev({ table, text, decide, minConfidence = 0.6, verify = null }) {
  const calls = []
  const list = shortlist(table, text)
  if (!list.length) return { result: null, reason: "no candidates", calls }

  const criteria = Object.fromEntries(list.map((f) => [f.id, describe(f)]))
  criteria.none =
    "None of these foods; or the entry is a dish, a brand, a packaged product, or several foods together."
  const first = await decide({
    state: { entry: text },
    questions: {
      food: { type: "choice", instructions: "Which food from the table is this diary entry? The text may be in English, Spanish or German.", criteria },
      single: { type: "noul", instructions: "The entry is one single plain food, not a dish, a meal, a brand or several foods together." },
    },
  })
  calls.push(first)
  if (first.error) return { result: null, reason: `jev error: ${first.error}`, calls }
  const pick = first.answers.food
  if (!pick || pick.choice === "none") return { result: null, reason: "jev: none", calls }
  if ((pick.confidence ?? 1) < minConfidence) return { result: null, reason: `jev unsure (${pick.confidence})`, calls }
  if ((first.answers.single?.noul ?? 1) < 0.5) return { result: null, reason: "jev: not a single food", calls }
  const food = list.find((f) => f.id === pick.choice)
  if (!food) return { result: null, reason: `jev picked unknown ${pick.choice}`, calls }

  // Optional check that the pick is the same food in the same state, not a
  // near neighbour ("egg whites" → whole egg, "con piel" → breast without skin).
  if (verify !== null) {
    const v = await decide({
      state: { entry: text, food: describe(food) },
      questions: {
        same: {
          type: "noul",
          instructions:
            "The table food is exactly what the entry describes: the same food, the same part (whole, whites, yolks, with or without skin), the same state (raw, cooked, dry, smoked, juice) and the same fat level. The amount doesn't matter.",
        },
      },
    })
    calls.push(v)
    if (v.error) return { result: null, reason: `jev error: ${v.error}`, calls }
    if ((v.answers.same?.noul ?? 0) < verify) return { result: null, reason: `jev: not the same food (${v.answers.same?.noul})`, calls }
  }

  let grams = statedGrams(text, food.density)
  let serving = grams === null ? null : `${Math.round(grams)} g`
  if (grams === null) {
    const count = statedCount(text)
    let portion = food.portions[0]
    if (!portion) return { result: null, reason: "no portion data", calls }
    if (food.portions.length > 1) {
      const pc = Object.fromEntries(food.portions.map((p, i) => [`p${i}`, `${p.label} (${p.grams} g)`]))
      const second = await decide({
        state: { entry: text, food: label(food) },
        questions: {
          portion: {
            type: "choice",
            instructions: "Which portion size does one item in the entry mean? If the entry gives no size, pick the usual medium or standard one.",
            criteria: pc,
          },
        },
      })
      calls.push(second)
      if (second.error) return { result: null, reason: `jev error: ${second.error}`, calls }
      portion = food.portions[Number(String(second.answers.portion?.choice ?? "p0").slice(1))] ?? portion
    }
    grams = count * portion.grams
    serving = `${count === 1 ? "" : `${count} × `}${portion.label} (${Math.round(grams)} g)`
  }

  const k = grams / 100
  const r1 = (x) => Math.round(x * 10) / 10
  return {
    reason: `matched ${food.id}`,
    calls,
    match: food.id,
    result: {
      status: "confident",
      food: {
        label: label(food),
        servingText: serving,
        grams: Math.round(grams),
        calories: Math.round(food.per100.kcal * k),
        protein_g: r1(food.per100.p * k),
        carbs_g: r1(food.per100.c * k),
        fat_g: r1(food.per100.f * k),
      },
    },
  }
}

// The AI macro-fill domain: the four-tier wire contract between the add card
// and Gemini (spec § AI macro-fill, #21; schema + worked examples in
// docs/research/gemini-firebase-ai-logic-macro-fill.md). Kept pure and
// Firebase-free (the entries import below is type-only, erased at compile):
// the model's JSON is untrusted, and the flat wire schema can't express
// which fields belong to which status — those tier rules are enforced here,
// client-side. The Gemini call itself lives in src/lib/ai.ts.
import type { EntryAiFill, FlaggableField } from "@/data/entries"

/** The macro fields the model may mark as low-confidence (wire names). */
export type AiUncertainField =
  "servingText" | "grams" | "calories" | "protein_g" | "carbs_g" | "fat_g"

/** The model's reading of the food — its interpretation, never the label. */
export interface AiFood {
  label: string
  servingText: string
  /** Resolved mass; null when the portion isn't mass-based ("1 burger"). */
  grams: number | null
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

/**
 * The four tiers as the app-side discriminated union (the wire carries one
 * flat status-enum object — Gemini's schema subset has no oneOf).
 */
export type MacroFillResult =
  | { status: "confident"; food: AiFood }
  | { status: "unsure"; food: AiFood; uncertainFields: AiUncertainField[] }
  | { status: "ambiguous"; question: string; answerChips: string[] }
  | { status: "hopeless"; hint: string }

/**
 * The tier rules and the two-speed grounding heuristic live here, in prompt
 * design (spec § AI macro-fill): the flat wire schema can't express which
 * fields belong to which status, and the model itself decides which foods
 * deserve a web search. Lifted from the #20 spike and extended with answer
 * chips and the follow-up turn.
 */
export const SYSTEM_PROMPT = `You estimate nutrition for a food diary. Input: one short free-text food description — or a follow-up turn in the form:
Food: "<description>"
Your clarifying question: "<question>"
The answer: "<answer>"
A follow-up is the same food with your question resolved; never ask another question about it.

Output: a single JSON object per the response schema.

Tier rules — pick exactly one status and fill only its fields:
- "confident": food and portion are identifiable; fill "food" with best-estimate macros.
- "unsure": identifiable, but some values are rough estimates; fill "food" AND "uncertainFields" (names of the low-confidence fields).
- "ambiguous": one blocking unknown prevents any estimate; fill BOTH "question" AND "answerChips". "question" is exactly one short clarifying question (one sentence) targeting the most blocking unknown. "answerChips" is REQUIRED on this tier: 2-4 short, concrete answers to that question the user can tap, each a complete answer (e.g. ["Cornflakes, 40 g", "Granola, 50 g", "Muesli, 60 g"]).
- "hopeless": no estimate is possible even with one clarification; fill only "hint" — one short hint (one sentence) about what input would work.

Example of a complete "ambiguous" response — note answerChips is filled:
{"status":"ambiguous","question":"Which cereal is it — and roughly how much?","answerChips":["Cornflakes, 40 g","Granola, 50 g","Muesli, 60 g"]}

All macro values are for the described portion (not per 100 g); calories in kcal.

Searching: for common staple foods (plain fruit or vegetables, eggs, butter, rice, generic bread and the like) answer directly from your knowledge — do NOT use Google Search. Use Google Search only for branded, restaurant, or region-specific foods where a label or menu is the source of truth; prefer manufacturer or retailer nutrition data.`

/**
 * Validate one model response into a MacroFillResult, or null if the text
 * isn't the contract (not JSON, unknown status, or a tier missing its
 * payload). Null means "treat as a failed call" — the UI shows its generic
 * try-again hint rather than trusting half a response.
 */
export function parseMacroFillResponse(text: string): MacroFillResult | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== "object" || raw === null) return null
  const data = raw as Record<string, unknown>

  if (data.status === "confident") {
    const food = parseFood(data.food)
    return food ? { status: "confident", food } : null
  }
  if (data.status === "unsure") {
    const food = parseFood(data.food)
    if (!food) return null
    const uncertainFields = parseUncertainFields(data.uncertainFields)
    // The schema can't force uncertainFields alongside "unsure"; nothing
    // actually uncertain is a confident fill with no flags.
    return uncertainFields.length > 0
      ? { status: "unsure", food, uncertainFields }
      : { status: "confident", food }
  }
  if (data.status === "ambiguous") {
    const question = parseLine(data.question)
    if (!question) return null
    const answerChips = parseChips(data.answerChips)
    // A question with nothing to tap is unanswerable in the zone (the chips
    // ARE the answer path — #5). Shown as a hint instead, the question is
    // still actionable: the user folds the detail into their description.
    if (answerChips.length === 0) return { status: "hopeless", hint: question }
    return { status: "ambiguous", question, answerChips }
  }
  if (data.status === "hopeless") {
    const hint = parseLine(data.hint)
    return hint ? { status: "hopeless", hint } : null
  }
  return null
}

/**
 * Enforce the one-round-trip cap on the answer to a clarifying question
 * (spec § AI macro-fill: a chip answer is the second and FINAL trip). A model
 * still ambiguous after its one question gets no third: its new question is
 * shown as a hopeless hint, so the user can fold that detail into their own
 * description instead.
 */
export function capFinalRoundTrip(result: MacroFillResult): MacroFillResult {
  return result.status === "ambiguous"
    ? { status: "hopeless", hint: result.question }
    : result
}

/**
 * The user message for the second round trip: the original description, the
 * model's one question, and the answer the user tapped (or typed). The shape
 * is announced in SYSTEM_PROMPT so the model reads it as a continuation, not
 * a new food.
 */
export function followUpPrompt(
  description: string,
  question: string,
  answer: string
): string {
  return `Food: "${description}"\nYour clarifying question: "${question}"\nThe answer: "${answer}"`
}

/**
 * The add-card fields a Flagged value can sit on: the kcal input plus the
 * three macro pills (their MACRO.key letters). Doubt about the portion —
 * servingText, grams or calories — all lands on the kcal field, the headline
 * number that guess actually moves; each macro maps onto its own pill.
 */
export type FormFlag = "kcal" | "p" | "f" | "c"

const FLAG_BY_UNCERTAIN: Record<AiUncertainField, FormFlag> = {
  servingText: "kcal",
  grams: "kcal",
  calories: "kcal",
  protein_g: "p",
  fat_g: "f",
  carbs_g: "c",
}

export function flagsFromUncertain(fields: AiUncertainField[]): Set<FormFlag> {
  return new Set(fields.map((field) => FLAG_BY_UNCERTAIN[field]))
}

/**
 * The flags still standing at commit, as the Entry's persisted flagged[]
 * (ADR 0003), in schema field order.
 */
export function flaggedFieldsFrom(
  flags: ReadonlySet<FormFlag>
): FlaggableField[] {
  const order: readonly (readonly [FormFlag, FlaggableField])[] = [
    ["kcal", "kcal"],
    ["p", "protein"],
    ["f", "fat"],
    ["c", "carbs"],
  ]
  return order.filter(([flag]) => flags.has(flag)).map(([, field]) => field)
}

/**
 * The nutrient values a surface already holds, Entry-shaped. What an AI fill
 * on a logged Entry (or the editor) must never overwrite — and what anchors
 * its prompt so the estimate stays consistent with them. An absent field is
 * one the fill may write.
 */
export interface KnownNutrients {
  kcal?: number
  protein?: number
  fat?: number
  carbs?: number
}

/**
 * The values an Entry actually carries. kcal 0 means "no calorie info" (the
 * dashed-row rule, ADR 0003), so it reads as unknown; a present 0-gram macro
 * is a logged value (black coffee) and stays known.
 */
export function knownFromEntry(entry: {
  kcal: number
  protein?: number
  fat?: number
  carbs?: number
}): KnownNutrients {
  const known: KnownNutrients = {}
  if (entry.kcal !== 0) known.kcal = entry.kcal
  if (entry.protein !== undefined) known.protein = entry.protein
  if (entry.fat !== undefined) known.fat = entry.fat
  if (entry.carbs !== undefined) known.carbs = entry.carbs
  return known
}

const FLAG_BY_NUTRIENT: Record<keyof KnownNutrients, FormFlag> = {
  kcal: "kcal",
  protein: "p",
  fat: "f",
  carbs: "c",
}

/** The form fields an AI fill may write: those without a known value. */
export function fillableFrom(known: KnownNutrients): Set<FormFlag> {
  const fillable = new Set<FormFlag>()
  for (const field of ["kcal", "protein", "fat", "carbs"] as const) {
    if (known[field] === undefined) fillable.add(FLAG_BY_NUTRIENT[field])
  }
  return fillable
}

/**
 * The user prompt for a fill on a surface that already holds values: the
 * label with the known values folded in as part of the description
 * ("porridge (320 kcal, 12 g protein)"), so the model's estimate for the
 * missing fields stays consistent with what's logged. Still "one short
 * free-text food description" to SYSTEM_PROMPT — no new wire contract.
 */
export function promptFrom(label: string, known: KnownNutrients): string {
  const parts: string[] = []
  if (known.kcal !== undefined) parts.push(`${known.kcal} kcal`)
  if (known.protein !== undefined) parts.push(`${known.protein} g protein`)
  if (known.fat !== undefined) parts.push(`${known.fat} g fat`)
  if (known.carbs !== undefined) parts.push(`${known.carbs} g carbs`)
  return parts.length === 0 ? label : `${label} (${parts.join(", ")})`
}

/**
 * An AI fill as add-card input strings: kcal a whole number, macro grams at
 * most one decimal (the V1 decimal-vs-integer truncation bug class — round,
 * never truncate).
 */
export function fillValuesFrom(food: AiFood): {
  kcal: string
  p: string
  f: string
  c: string
} {
  const grams = (n: number) => String(Math.round(n * 10) / 10)
  return {
    kcal: String(Math.round(food.calories)),
    p: grams(food.protein_g),
    f: grams(food.fat_g),
    c: grams(food.carbs_g),
  }
}

/**
 * An AI fill as Entry numbers, same rounding as the add-card strings: kcal a
 * whole number, macro grams at most one decimal.
 */
export function fillNumbersFrom(food: AiFood): {
  kcal: number
  protein: number
  fat: number
  carbs: number
} {
  const grams = (n: number) => Math.round(n * 10) / 10
  return {
    kcal: Math.round(food.calories),
    protein: grams(food.protein_g),
    fat: grams(food.fat_g),
    carbs: grams(food.carbs_g),
  }
}

/**
 * The patch a row-level fill writes onto a logged Entry (#53): the model's
 * numbers for the fields the Entry was missing — a logged value is never
 * overwritten — and, of the model's doubts (as form flags), only those that
 * landed on a field actually written (doubt about a value the user logged
 * has nowhere to sit).
 */
export function entryFillFrom(
  known: KnownNutrients,
  food: AiFood,
  doubts: ReadonlySet<FormFlag>
): EntryAiFill {
  const fillable = fillableFrom(known)
  const numbers = fillNumbersFrom(food)
  const fill: EntryAiFill = {}
  if (fillable.has("kcal")) fill.kcal = numbers.kcal
  if (fillable.has("p")) fill.protein = numbers.protein
  if (fillable.has("f")) fill.fat = numbers.fat
  if (fillable.has("c")) fill.carbs = numbers.carbs
  const standing = new Set([...doubts].filter((f) => fillable.has(f)))
  const flagged = flaggedFieldsFrom(standing)
  if (flagged.length > 0) fill.flagged = flagged
  return fill
}

/**
 * Persisted flagged fields as their form flags — the inverse of
 * flaggedFieldsFrom, seeding the editor's dashed outlines so a committed
 * Entry's Flagged values finally get their review surface (#53).
 */
export function formFlagsFrom(flagged?: FlaggableField[]): Set<FormFlag> {
  const byField: Record<FlaggableField, FormFlag> = {
    kcal: "kcal",
    protein: "p",
    fat: "f",
    carbs: "c",
  }
  return new Set((flagged ?? []).map((field) => byField[field]))
}

/**
 * The info-row line naming what the AI actually estimated ("Butter, salted —
 * 10 g"). The label input itself is never rewritten (spec § AI macro-fill).
 */
export function interpretationOf(food: AiFood): string {
  const serving = food.servingText.trim()
  return serving === "" ? food.label : `${food.label} — ${serving}`
}

/**
 * Pin the Google Search Suggestions HTML to the app's resolved theme. The
 * payload ships Google's light and dark variants behind prefers-color-scheme
 * media queries, which track the OS — but Yaffle's theme is a user setting,
 * so a forced theme opposite the OS would show the wrong variant. Rewriting
 * the query conditions (`all` = always on, `not all` = never) selects between
 * Google's own style sets without touching them.
 */
export function bindAttributionToTheme(
  html: string,
  resolved: "dark" | "light"
): string {
  return html.replace(
    /@media\s*\(\s*prefers-color-scheme:\s*(light|dark)\s*\)/g,
    (_match, scheme: string) =>
      scheme === resolved ? "@media all" : "@media not all"
  )
}

/** A required one-line string field: trimmed, empty means missing. */
function parseLine(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const text = raw.trim()
  return text === "" ? null : text
}

/** At most four distinct, non-blank quick-tap answers (order preserved). */
const MAX_ANSWER_CHIPS = 4

function parseChips(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const chips: string[] = []
  for (const item of raw) {
    const chip = typeof item === "string" ? item.trim() : ""
    if (chip !== "" && !chips.includes(chip)) chips.push(chip)
    if (chips.length === MAX_ANSWER_CHIPS) break
  }
  return chips
}

const UNCERTAIN_FIELDS: readonly AiUncertainField[] = [
  "servingText",
  "grams",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
]

function parseUncertainFields(raw: unknown): AiUncertainField[] {
  if (!Array.isArray(raw)) return []
  return UNCERTAIN_FIELDS.filter((field) => raw.includes(field))
}

/** A usable nutrition number: finite and not negative. */
function isAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function parseFood(raw: unknown): AiFood | null {
  if (typeof raw !== "object" || raw === null) return null
  const data = raw as Record<string, unknown>
  if (typeof data.label !== "string") return null
  if (typeof data.servingText !== "string") return null
  const grams = isAmount(data.grams) ? data.grams : null
  const { calories, protein_g, carbs_g, fat_g } = data
  if (
    !isAmount(calories) ||
    !isAmount(protein_g) ||
    !isAmount(carbs_g) ||
    !isAmount(fat_g)
  ) {
    return null
  }
  return {
    label: data.label,
    servingText: data.servingText,
    grams,
    calories,
    protein_g,
    carbs_g,
    fat_g,
  }
}

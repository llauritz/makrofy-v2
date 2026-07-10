// PROTOTYPE — issue #5 "Prototype the add flow". Throwaway mock engine:
// (1) history typeahead — frecency ranking, normalized-label dedup;
// (2) mock AI macro-fill — the four-tier contract from the Gemini research
//     (docs/research/gemini-firebase-ai-logic-macro-fill.md) with two-speed
//     latency: staples resolve fast & ungrounded, web-lookup foods take a
//     realistic 1.8–3.8 s and carry a mocked Google Search attribution.

// ---------------------------------------------------------------------------
// Typeahead — parameters under test (react to these):
//   MIN_QUERY_CHARS = 2, MAX_SUGGESTIONS = 4,
//   ranking = frecency (uses decayed by recency, ~3-week half-life),
//   dedup   = normalized label (case / whitespace / trailing punctuation).
// ---------------------------------------------------------------------------

export const MIN_QUERY_CHARS = 2
export const MAX_SUGGESTIONS = 4

export type HistoryItem = {
  label: string
  kcal: number
  p: number
  f: number
  c: number
  uses: number
  daysAgo: number
}

// Raw history — includes near-duplicate labels on purpose to exercise dedup.
const RAW_HISTORY: HistoryItem[] = [
  { label: "Cappuccino", kcal: 90, p: 5, f: 5, c: 6, uses: 34, daysAgo: 0 },
  { label: "Banana", kcal: 105, p: 1, f: 0, c: 27, uses: 21, daysAgo: 4 },
  { label: "Oatmeal with blueberries", kcal: 320, p: 12, f: 7, c: 54, uses: 18, daysAgo: 1 },
  { label: "Protein shake (vanilla)", kcal: 180, p: 32, f: 3, c: 8, uses: 15, daysAgo: 6 },
  { label: "Dark chocolate (2 squares)", kcal: 110, p: 1, f: 7, c: 10, uses: 13, daysAgo: 1 },
  { label: "Chicken caesar wrap", kcal: 540, p: 38, f: 21, c: 42, uses: 11, daysAgo: 2 },
  { label: "Greek yogurt with honey", kcal: 150, p: 15, f: 2, c: 18, uses: 9, daysAgo: 1 },
  // near-duplicate of the above — must merge into one suggestion
  { label: "greek  yogurt with honey.", kcal: 145, p: 14, f: 2, c: 17, uses: 3, daysAgo: 26 },
  { label: "Rye bread with butter", kcal: 190, p: 4, f: 8, c: 24, uses: 9, daysAgo: 12 },
  { label: "Salmon, rice & greens", kcal: 620, p: 42, f: 22, c: 58, uses: 7, daysAgo: 3 },
  { label: "Chicken breast 200 g", kcal: 330, p: 62, f: 7, c: 0, uses: 6, daysAgo: 9 },
  { label: "Caesar salad", kcal: 360, p: 12, f: 28, c: 14, uses: 4, daysAgo: 18 },
  { label: "Cheese toastie", kcal: 410, p: 16, f: 22, c: 36, uses: 3, daysAgo: 40 },
  { label: "Big Mac", kcal: 563, p: 26, f: 33, c: 44, uses: 2, daysAgo: 33 },
  { label: "Musly", kcal: 0, p: 0, f: 0, c: 0, uses: 2, daysAgo: 60 },
]

export function normalizeLabel(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!]+$/g, "")
}

// Dedup at module init: merge normalized-equal labels — keep the most recent
// entry's label + macros (freshest data), sum the use counts.
const HISTORY: HistoryItem[] = (() => {
  const byKey = new Map<string, HistoryItem>()
  for (const item of RAW_HISTORY) {
    const key = normalizeLabel(item.label)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { ...item })
    } else if (item.daysAgo < existing.daysAgo) {
      byKey.set(key, { ...item, uses: existing.uses + item.uses })
    } else {
      existing.uses += item.uses
    }
  }
  return [...byKey.values()]
})()

// Frecency: reuse count decayed by recency (half-life ≈ 3 weeks).
function frecency(item: HistoryItem): number {
  return item.uses * Math.exp(-item.daysAgo / 30)
}

export type Suggestion = HistoryItem & { score: number }

export function suggest(query: string): Suggestion[] {
  const q = normalizeLabel(query)
  if (q.length < MIN_QUERY_CHARS) return []
  return HISTORY.filter((item) => normalizeLabel(item.label).includes(q))
    .map((item) => ({ ...item, score: frecency(item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS)
}

// ---------------------------------------------------------------------------
// Mock AI macro-fill — mirrors the wire contract validated in issue #3:
// flat status enum, optional payload per tier. `grounded` + `searchQuery`
// stand in for groundingMetadata.searchEntryPoint (the thing Google requires
// us to display). `chips` are prototype-only quick answers for the
// ambiguous tier — the real model returns just the question text.
// ---------------------------------------------------------------------------

export type MacroField = "grams" | "calories" | "protein_g" | "fat_g" | "carbs_g"

export type Food = {
  label: string
  servingText: string
  grams: number | null
  calories: number
  protein_g: number
  fat_g: number
  carbs_g: number
}

export type MacroFillResult =
  | { status: "confident"; food: Food }
  | { status: "unsure"; food: Food; uncertainFields: MacroField[] }
  | { status: "ambiguous"; question: string; chips: string[] }
  | { status: "hopeless"; hint: string }

export type AiReply = {
  result: MacroFillResult
  grounded: boolean
  searchQuery?: string
}

type Rule = { match: RegExp; reply: () => AiReply }

const RULES: Rule[] = [
  {
    // staple, quantity given → confident, no web search needed (fast path)
    match: /butter/i,
    reply: () => ({
      grounded: false,
      result: {
        status: "confident",
        food: {
          label: "Butter, salted",
          servingText: "10 g",
          grams: 10,
          calories: 72,
          protein_g: 0.1,
          fat_g: 8.1,
          carbs_g: 0,
        },
      },
    }),
  },
  {
    // staple, portion estimated → unsure, flag the estimated fields (fast path)
    match: /banana/i,
    reply: () => ({
      grounded: false,
      result: {
        status: "unsure",
        food: {
          label: "Banana, raw",
          servingText: "1 medium (~118 g)",
          grams: 118,
          calories: 105,
          protein_g: 1.3,
          fat_g: 0.4,
          carbs_g: 27,
        },
        uncertainFields: ["grams", "calories"],
      },
    }),
  },
  {
    // blocking unknown → exactly one question, quick-tap chips
    match: /cereal|bowl of/i,
    reply: () => ({
      grounded: false,
      result: {
        status: "ambiguous",
        question: "Which cereal is it — and roughly how much?",
        chips: ["Cornflakes, 40 g", "Granola, 50 g", "Muesli, 60 g"],
      },
    }),
  },
  {
    match: /cornflakes/i,
    reply: () => ({
      grounded: false,
      result: {
        status: "confident",
        food: {
          label: "Cornflakes",
          servingText: "40 g",
          grams: 40,
          calories: 150,
          protein_g: 3,
          fat_g: 0.4,
          carbs_g: 34,
        },
      },
    }),
  },
  {
    match: /granola/i,
    reply: () => ({
      grounded: true,
      searchQuery: "granola calories per 50g",
      result: {
        status: "confident",
        food: {
          label: "Granola",
          servingText: "50 g",
          grams: 50,
          calories: 230,
          protein_g: 5,
          fat_g: 9,
          carbs_g: 32,
        },
      },
    }),
  },
  {
    match: /muesli|musly/i,
    reply: () => ({
      grounded: false,
      result: {
        status: "confident",
        food: {
          label: "Muesli",
          servingText: "60 g",
          grams: 60,
          calories: 220,
          protein_g: 6,
          fat_g: 4,
          carbs_g: 40,
        },
      },
    }),
  },
  {
    // unknowable → refuse with a usable hint
    match: /stew|grandma|secret/i,
    reply: () => ({
      grounded: false,
      result: {
        status: "hopeless",
        hint: "Tell me the main ingredients and rough amounts — e.g. “200 g beef, 1 potato, 100 ml cream”.",
      },
    }),
  },
  {
    // branded/restaurant food → web lookup: slow + Google attribution
    match: /big mac|mcdonald/i,
    reply: () => ({
      grounded: true,
      searchQuery: "big mac nutrition facts",
      result: {
        status: "confident",
        food: {
          label: "Big Mac",
          servingText: "1 burger",
          grams: null,
          calories: 563,
          protein_g: 26,
          fat_g: 33,
          carbs_g: 44,
        },
      },
    }),
  },
  {
    // branded but variable → grounded AND flagged (both signals at once)
    match: /quest bar|protein bar/i,
    reply: () => ({
      grounded: true,
      searchQuery: "quest bar chocolate chip nutrition",
      result: {
        status: "unsure",
        food: {
          label: "Quest Bar, chocolate chip",
          servingText: "1 bar (60 g)",
          grams: 60,
          calories: 200,
          protein_g: 21,
          fat_g: 9,
          carbs_g: 21,
        },
        uncertainFields: ["calories", "fat_g"],
      },
    }),
  },
]

// Fallback for anything unmatched: a grounded rough estimate, flagged.
function fallbackReply(input: string): AiReply {
  return {
    grounded: true,
    searchQuery: `${normalizeLabel(input)} calories`,
    result: {
      status: "unsure",
      food: {
        label: input.trim().replace(/^./, (ch) => ch.toUpperCase()),
        servingText: "1 typical serving",
        grams: null,
        calories: 300,
        protein_g: 10,
        fat_g: 12,
        carbs_g: 35,
      },
      uncertainFields: ["calories", "protein_g", "fat_g", "carbs_g"],
    },
  }
}

// Latency model from the research note: grounded ≈ 1.8–3.8 s (live search
// round-trip), ungrounded flash-lite ≈ 0.35–0.7 s.
function latencyFor(reply: AiReply): number {
  return reply.grounded ? 1800 + Math.random() * 2000 : 350 + Math.random() * 350
}

export function mockMacroFill(input: string): Promise<AiReply> {
  const rule = RULES.find((r) => r.match.test(input))
  const reply = rule ? rule.reply() : fallbackReply(input)
  return new Promise((resolve) => setTimeout(() => resolve(reply), latencyFor(reply)))
}

// Suggested test phrases, surfaced in the prototype tray (one per tier + the
// grounded/ungrounded split).
export const TRY_PHRASES = [
  "10g butter",
  "medium banana",
  "bowl of cereal",
  "big mac",
  "quest bar",
  "grandma's secret stew",
]

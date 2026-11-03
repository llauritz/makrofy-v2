// The catalogue of variants: each is one way to turn a food description into
// a fill. Pick them by name on the command line, with options after a colon:
//   today  ·  cascade:model=gemini-3.1-flash-lite  ·  jev-check:threshold=0.8
// Options every variant takes: model (Gemini), thinking (MINIMAL|LOW|MEDIUM|
// HIGH|none), jev (Jev model). To add a variant, add an entry here: a short
// description and a run(s) function built from the steps in lib/steps.mjs.
// It returns { result } (a MacroFillResult) plus, for routers, { route }.

export const DEFAULTS = { model: "gemini-3.5-flash-lite", thinking: "LOW", jev: "jev-latest" }

const g = (o) => ({ model: o.model, thinking: o.thinking === "none" ? null : o.thinking })

// The two-step fill from functions/src/ai-fill.ts (ADR 0016): no search
// first, and a search call only when the first one hands over.
async function cascade(s, o) {
  const first = await s.fill({ ...g(o), prompt: "ROUTING_PROMPT", search: false, handOver: true })
  if (first.out.status !== "search") return { result: first.out }
  const second = await s.fill({ ...g(o), prompt: "SEARCH_PROMPT", search: true })
  return { result: second.out }
}

// verify=<0..1>: a second Jev question checks the pick is the same food in
// the same state (part, cooking, fat level); below the threshold is a miss.
const tableOpts = (o) => ({ jevModel: o.jev, minConfidence: Number(o.minConfidence ?? 0.6), verify: o.verify === undefined ? null : Number(o.verify) })

const isFood = (r) => r?.status === "confident" || r?.status === "unsure"

export const VARIANTS = {
  today: {
    describe: "The app today: one Gemini call with Google Search, the model decides whether to search (src/lib/macro-fill.ts SYSTEM_PROMPT).",
    run: async (s, o) => ({ result: (await s.fill({ ...g(o), prompt: "app", search: true })).out }),
  },
  "no-search": {
    describe: "Today's prompt with no search tool. The floor on cost, and the accuracy of Gemini's own knowledge.",
    run: async (s, o) => ({ result: (await s.fill({ ...g(o), prompt: "app", search: false })).out }),
  },
  cascade: {
    describe: "Two-step fill from functions/src/ai-prompt.ts: ROUTING_PROMPT without search answers or hands over; SEARCH_PROMPT with search runs only after a hand-over.",
    run: (s, o) => cascade(s, o),
  },
  "gemini-router": {
    describe: "A small Gemini call picks staple, branded or vague; brands get today's prompt with search, the rest today's prompt without.",
    run: async (s, o) => {
      const r = await s.groute(g(o))
      const search = r.out === "branded"
      return { route: r.out, result: (await s.fill({ ...g(o), prompt: "app", search })).out }
    },
  },
  "jev-router": {
    describe: "Jev picks staple, branded or vague (choice question); brands get today's prompt with search, the rest today's prompt without.",
    run: async (s, o) => {
      const r = await s.jroute({ jevModel: o.jev })
      const search = r.out?.route === "branded" || !r.out
      return { route: r.out?.route ?? null, result: (await s.fill({ ...g(o), prompt: "app", search })).out }
    },
  },
  "jev-yesno": {
    describe: "Jev's yes/no \"needs a search\" (threshold, default 0.5) decides; otherwise as jev-router.",
    run: async (s, o) => {
      const r = await s.jroute({ jevModel: o.jev })
      const search = (r.out?.needsSearch ?? 1) >= Number(o.threshold ?? 0.5)
      return { route: search ? "branded" : "not-branded", result: (await s.fill({ ...g(o), prompt: "app", search })).out }
    },
  },
  "jev-cascade": {
    describe: "Jev sends brands straight to SEARCH_PROMPT with search; everything else goes through the cascade.",
    run: async (s, o) => {
      const r = await s.jroute({ jevModel: o.jev })
      if (r.out?.route === "branded") {
        return { route: "branded", result: (await s.fill({ ...g(o), prompt: "SEARCH_PROMPT", search: true })).out }
      }
      return { route: r.out?.route ?? null, ...(await cascade(s, o)) }
    },
  },
  "jev-check": {
    describe: "Today's prompt without search first; Jev rates the answer, and a search call runs when the rating is below the threshold (default 0.5).",
    run: async (s, o) => {
      const first = await s.fill({ ...g(o), prompt: "app", search: false })
      if (!isFood(first.out)) return { result: first.out }
      const c = await s.jcheck({ jevModel: o.jev }, first.out.food)
      if (c.out !== null && c.out >= Number(o.threshold ?? 0.5)) return { result: first.out }
      return { result: (await s.fill({ ...g(o), prompt: "app", search: true })).out }
    },
  },
  "table-jev": {
    describe: "Our USDA food table first: Jev picks the food and portion and code does the sums; a miss (no match, \"none\", Jev unsure, not a single food) falls back to the cascade. Option verify=0.5 adds a Jev check that the pick is the same food in the same state.",
    run: async (s, o) => {
      const t = await s.table(tableOpts(o))
      if (t.out?.result) return { result: t.out.result, tableHit: t.out.match }
      return { tableMiss: t.out?.reason, ...(await cascade(s, o)) }
    },
  },
  "jev-table": {
    describe: "Full hybrid: Jev routes; brands go to SEARCH_PROMPT with search, staples try the food table first, and everything else (and table misses) goes through the cascade.",
    run: async (s, o) => {
      const r = await s.jroute({ jevModel: o.jev })
      const route = r.out?.route ?? null
      if (route === "branded") {
        return { route, result: (await s.fill({ ...g(o), prompt: "SEARCH_PROMPT", search: true })).out }
      }
      let tableMiss
      if (route === "staple") {
        const t = await s.table(tableOpts(o))
        if (t.out?.result) return { route, result: t.out.result, tableHit: t.out.match }
        tableMiss = t.out?.reason
      }
      return { route, tableMiss, ...(await cascade(s, o)) }
    },
  },
}

/** "cascade:model=x,thinking=MINIMAL" → { id, name, base, options } */
export function parseVariant(spec) {
  const [base, opts = ""] = spec.split(":")
  if (!VARIANTS[base]) {
    throw new Error(`Unknown variant "${base}". Known: ${Object.keys(VARIANTS).join(", ")}`)
  }
  const options = { ...DEFAULTS }
  for (const kv of opts.split(",").filter(Boolean)) {
    const [k, v] = kv.split("=")
    options[k] = v
  }
  return { id: spec, base, options, describe: VARIANTS[base].describe }
}

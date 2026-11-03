// The building blocks variants are made of. Within one food and round, a
// step with the same parameters runs once and every variant that uses it
// gets the same answer, so differences between variants come from how they
// combine steps, not from the noise of separate calls.
import { parseMacroFillResponse } from "../../../src/lib/macro-fill.ts"
import { callCost } from "./prices.mjs"
import { matchWithJev } from "./table.mjs"
import {
  fillSchema,
  GEMINI_ROUTER_PROMPT,
  GEMINI_ROUTER_SCHEMA,
  JEV_CHECK_QUESTIONS,
  JEV_ROUTER_QUESTIONS,
} from "../prompts.mjs"

function parseFill(text, handOver) {
  if (handOver) {
    try {
      if (JSON.parse(text)?.status === "search") return { status: "search" }
    } catch {
      // the contract parser reports it as invalid
    }
  }
  return parseMacroFillResponse(text ?? "") ?? { status: "invalid" }
}

/**
 * One food in one round. `memo` is shared by all variants for that food and
 * round; `steps(trace)` gives a variant its step functions, each of which
 * appends what it used to the variant's trace.
 */
export function foodContext({ gemini, jev, prompts, table, text }) {
  const memo = new Map()
  const once = (key, fn) => {
    if (!memo.has(key)) memo.set(key, fn())
    return memo.get(key)
  }
  const needJev = () => {
    if (!jev) throw new Error("This variant needs Jev: set TYPESAFE_API_KEY (shell or .env.local).")
  }

  function steps(trace) {
    const use = async (key, fn) => {
      const rec = await once(key, fn)
      trace.push(rec)
      return rec
    }
    return {
      /** A Gemini fill. prompt: "app" | "ROUTING_PROMPT" | "SEARCH_PROMPT" | "SYSTEM_PROMPT". */
      fill: ({ model, thinking, prompt, search, handOver = false }) => {
        const p = prompts[prompt]
        if (!p) throw new Error(`Prompt ${prompt} is not available (see --prompts-ref).`)
        const key = JSON.stringify(["fill", model, thinking, prompt, p.sha, search, handOver])
        return use(key, async () => {
          const r = await gemini.generate({ model, thinking, system: p.text, user: text, schema: fillSchema(handOver), search })
          return {
            step: `fill ${prompt}${search ? " +search" : ""}`, model, search, ms: r.ms, queries: r.queries ?? 0,
            usage: r.usage ?? { input: 0, output: 0 }, error: r.error,
            cost: r.usage ? callCost(model, r.usage, r.queries) : 0,
            out: r.error ? { status: "error" } : parseFill(r.text, handOver),
            text: r.text?.slice(0, 600),
          }
        })
      },

      /** Gemini as a three-way router (staple / branded / vague). */
      groute: ({ model, thinking }) =>
        use(JSON.stringify(["groute", model, thinking]), async () => {
          const r = await gemini.generate({ model, thinking, system: GEMINI_ROUTER_PROMPT, user: text, schema: GEMINI_ROUTER_SCHEMA, search: false })
          let route = null
          try {
            route = JSON.parse(r.text).route ?? null
          } catch {
            // invalid reply: no route
          }
          return {
            step: "gemini route", model, search: false, ms: r.ms, queries: 0, usage: r.usage ?? { input: 0, output: 0 },
            error: r.error, cost: r.usage ? callCost(model, r.usage) : 0, out: route,
          }
        }),

      /** Jev: three-way choice plus a yes/no "needs a search", in one request. */
      jroute: ({ jevModel }) => {
        needJev()
        return use(JSON.stringify(["jroute", jevModel]), async () => {
          const r = await jev.decide({ model: jevModel, state: { entry: text }, questions: JEV_ROUTER_QUESTIONS })
          return {
            step: "jev route", model: jevModel, resolved: r.resolved, search: false, ms: r.ms, queries: 0,
            usage: r.usage ?? { input: 0, output: 0 }, error: r.error,
            cost: r.usage ? callCost(jevModel, r.usage) : 0,
            out: r.error ? null : {
              route: r.answers.route?.choice ?? null,
              confidence: r.answers.route?.confidence ?? null,
              needsSearch: r.answers.needs_search?.noul ?? null,
            },
          }
        })
      },

      /** Jev: is a no-search answer plausible? Returns the yes-probability. */
      jcheck: ({ jevModel }, food) => {
        needJev()
        const answer = {
          label: food.label, serving: food.servingText, grams: food.grams, kcal: food.calories,
          protein_g: food.protein_g, fat_g: food.fat_g, carbs_g: food.carbs_g,
        }
        return use(JSON.stringify(["jcheck", jevModel, answer]), async () => {
          const r = await jev.decide({ model: jevModel, state: { entry: text, answer }, questions: JEV_CHECK_QUESTIONS })
          return {
            step: "jev check", model: jevModel, resolved: r.resolved, search: false, ms: r.ms, queries: 0,
            usage: r.usage ?? { input: 0, output: 0 }, error: r.error,
            cost: r.usage ? callCost(jevModel, r.usage) : 0,
            out: r.error ? null : r.answers.plausible?.noul ?? null,
          }
        })
      },

      /** Our food table, with Jev picking the food and the portion. */
      table: ({ jevModel, minConfidence }) => {
        needJev()
        if (!table) throw new Error("No food table: run scripts/ai-bench/data/build-food-table.mjs first.")
        return use(JSON.stringify(["table", jevModel, minConfidence]), async () => {
          const decide = (req) => jev.decide({ model: jevModel, ...req })
          const m = await matchWithJev({ table, text, decide, minConfidence })
          const usage = { input: m.calls.reduce((s, c) => s + (c.usage?.input ?? 0), 0), output: 0 }
          return {
            step: "table + jev", model: jevModel, search: false, queries: 0, usage,
            ms: m.calls.reduce((s, c) => s + (c.ms ?? 0), 0),
            error: m.calls.find((c) => c.error)?.error, cost: callCost(jevModel, usage),
            out: { result: m.result, reason: m.reason, match: m.match ?? null },
          }
        })
      },
    }
  }
  return { steps }
}

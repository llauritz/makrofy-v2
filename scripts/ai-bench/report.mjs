#!/usr/bin/env node
// Turns a router-bench run (run.mjs) into markdown: each design is built from
// the same raw calls, then scored on cost, speed, routing and the numbers.
//   node scripts/ai-bench/report.mjs docs/research/ai-bench/runs/<file>.json
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { FOODS } from "./foods.mjs"

// Prices in USD (checked 3 Nov 2026). The 5,000 free searches a month are
// ignored: at launch volume they run out early in the month.
export const PRICES = {
  geminiInPerM: 0.3, // gemini-3.5-flash-lite input (incl. tool-use prompt tokens)
  geminiOutPerM: 2.5, // output incl. thinking
  searchPerQuery: 0.014, // Grounding with Google Search, Gemini 3+: $14 per 1,000 queries
  jevInPerM: 0.042, // TypeSafe Jev input; output is free
}

const geminiCost = (c) =>
  c?.usage
    ? (c.usage.input * PRICES.geminiInPerM + c.usage.output * PRICES.geminiOutPerM) / 1e6 +
      (c.queries ?? 0) * PRICES.searchPerQuery
    : 0
const jevCost = (c) => (c?.usage ? (c.usage.input * PRICES.jevInPerM) / 1e6 : 0)

const isFood = (r) => r?.status === "confident" || r?.status === "unsure"

// ── Pipelines: each returns { result, calls: [{arm, ms, cost, queries}] } ──
const step = (raw, arm) => {
  const c = raw[arm]
  const cost = arm.startsWith("j") ? jevCost(c) : geminiCost(c)
  return { arm, ms: c?.ms ?? 0, cost, queries: c?.queries ?? 0, error: c?.error }
}
const jevRoute = (raw) => raw.jroute?.answers?.route?.choice ?? null
const jevNoul = (raw) => raw.jroute?.answers?.needs_search?.noul ?? null
const checkNoul = (raw) => raw.jcheck?.answers?.plausible?.noul ?? null

const cascadeOf = (raw, pre = []) =>
  raw.cascade.result.status === "search"
    ? { result: raw.search.result, calls: [...pre, step(raw, "cascade"), step(raw, "search")] }
    : { result: raw.cascade.result, calls: [...pre, step(raw, "cascade")] }

export const PIPELINES = [
  {
    id: "today",
    name: "Today: one call with search",
    build: (raw) => ({ result: raw.search.result, calls: [step(raw, "search")] }),
  },
  {
    id: "plain",
    name: "Never search (floor on cost)",
    build: (raw) => ({ result: raw.plain.result, calls: [step(raw, "plain")] }),
  },
  {
    id: "cascade",
    name: "Gemini cascade: answer or say \"search\"",
    build: (raw) => cascadeOf(raw),
  },
  {
    id: "groute",
    name: "Gemini router, then fill",
    build: (raw) => {
      const pre = [step(raw, "groute")]
      return raw.groute.route === "branded"
        ? { result: raw.search.result, calls: [...pre, step(raw, "search")] }
        : { result: raw.plain.result, calls: [...pre, step(raw, "plain")] }
    },
  },
  {
    id: "jroute",
    name: "Jev router (choice), then fill",
    needs: "jroute",
    build: (raw) => {
      const pre = [step(raw, "jroute")]
      return jevRoute(raw) === "branded"
        ? { result: raw.search.result, calls: [...pre, step(raw, "search")] }
        : { result: raw.plain.result, calls: [...pre, step(raw, "plain")] }
    },
  },
  {
    id: "jnoul",
    name: "Jev router (yes/no ≥ 0.5), then fill",
    needs: "jroute",
    build: (raw) => {
      const pre = [step(raw, "jroute")]
      return (jevNoul(raw) ?? 1) >= 0.5
        ? { result: raw.search.result, calls: [...pre, step(raw, "search")] }
        : { result: raw.plain.result, calls: [...pre, step(raw, "plain")] }
    },
  },
  {
    id: "jgate",
    name: "Jev sends brands straight to search, else cascade",
    needs: "jroute",
    build: (raw) => {
      const pre = [step(raw, "jroute")]
      return jevRoute(raw) === "branded"
        ? { result: raw.search.result, calls: [...pre, step(raw, "search")] }
        : cascadeOf(raw, pre)
    },
  },
  ...[0.5, 0.8].map((t) => ({
    id: `jcheck${t}`,
    name: `No search first, Jev checks (search if < ${t})`,
    needs: "jroute",
    build: (raw) => {
      const pre = [step(raw, "plain")]
      if (!isFood(raw.plain.result)) return { result: raw.plain.result, calls: pre }
      const n = checkNoul(raw)
      return n !== null && n < t
        ? { result: raw.search.result, calls: [...pre, step(raw, "jcheck"), step(raw, "search")] }
        : { result: raw.plain.result, calls: [...pre, step(raw, "jcheck")] }
    },
  })),
]

// ── Scoring ────────────────────────────────────────────────────────────────
const median = (xs) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const pct = (xs, p) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]
}
const IMPERIAL = /\b(oz|ounces?|cups?|tbsp|tsp|tablespoons?|teaspoons?|lbs?|pounds?|inch(es)?|fl\.? ?oz)\b|\d"/i

function score(pipe, calls, foodsByText) {
  const rows = calls.map((raw) => {
    const food = foodsByText.get(raw.food)
    const { result, calls: steps } = pipe.build(raw)
    const ms = steps.reduce((s, c) => s + c.ms, 0)
    const cost = steps.reduce((s, c) => s + c.cost, 0)
    const queries = steps.reduce((s, c) => s + c.queries, 0)
    const ref = food.ref
    let kcalErr = null
    let hit = null
    if (ref) {
      if (isFood(result)) {
        kcalErr = Math.abs(result.food.calories - ref.kcal) / ref.kcal
        hit = kcalErr <= ref.tol
      } else hit = false
    }
    let atwater = null
    if (isFood(result) && result.food.calories > 20) {
      const f = result.food
      atwater = Math.abs(4 * f.protein_g + 4 * f.carbs_g + 9 * f.fat_g - f.calories) / f.calories
    }
    return {
      food, raw, result, ms, cost, queries,
      searched: queries > 0,
      statusOk: food.accept.includes(result.status),
      kcalErr, hit, atwater,
      imperial: isFood(result) && IMPERIAL.test(result.food.servingText),
      failed: result.status === "invalid" || result.status === "error",
    }
  })
  const of = (sel) => rows.filter(sel)
  const summary = (rs) => {
    const refRows = rs.filter((r) => r.hit !== null)
    return {
      n: rs.length,
      failed: rs.filter((r) => r.failed).length,
      statusOk: rs.filter((r) => r.statusOk).length / (rs.length || 1),
      hits: refRows.filter((r) => r.hit).length,
      refN: refRows.length,
      medErr: median(refRows.filter((r) => r.kcalErr !== null).map((r) => r.kcalErr)),
      searched: rs.filter((r) => r.searched).length / (rs.length || 1),
      queries: rs.reduce((s, r) => s + r.queries, 0) / (rs.length || 1),
      cost: rs.reduce((s, r) => s + r.cost, 0) / (rs.length || 1),
      msMed: median(rs.map((r) => r.ms)),
      msP90: pct(rs.map((r) => r.ms), 90),
      atwater: median(rs.filter((r) => r.atwater !== null).map((r) => r.atwater)),
      imperial: rs.filter((r) => r.imperial).length,
    }
  }
  return {
    rows,
    all: summary(rows),
    byKind: Object.fromEntries(
      ["staple", "branded", "vague"].map((k) => [k, summary(of((r) => r.food.kind === k))])
    ),
  }
}

function routeAccuracy(calls, foodsByText) {
  // Three-way routers name a kind; yes/no ones only say "search" or not.
  const routers = [
    ["Gemini router", false, (raw) => raw.groute?.route ?? null],
    ["Jev choice", false, (raw) => jevRoute(raw)],
    ["Jev yes/no", true, (raw) => {
      const n = jevNoul(raw)
      return n === null ? null : n >= 0.5
    }],
    ["Gemini cascade", true, (raw) => {
      const st = raw.cascade?.result?.status
      return !st || st === "error" || st === "invalid" ? null : st === "search"
    }],
  ]
  return routers.map(([name, binary, get]) => {
    let n = 0, exact = 0, searchRight = 0, missedBrand = 0, wastedSearch = 0
    const confusion = {}
    for (const raw of calls) {
      const food = foodsByText.get(raw.food)
      const route = get(raw)
      if (route === null) continue
      n++
      const ok = [food.kind, ...(food.alsoOk ?? [])]
      if (!binary && ok.includes(route)) exact++
      const okSearch = ok.includes("branded")
      const okNoSearch = ok.some((k) => k !== "branded")
      const saysSearch = binary ? route : route === "branded"
      let wrong = null
      if (saysSearch ? okSearch : okNoSearch) searchRight++
      else if (saysSearch) (wastedSearch++, (wrong = `${food.kind}→search`))
      else (missedBrand++, (wrong = `${food.kind}→no search`))
      if (!binary && !ok.includes(route)) wrong = `${food.kind}→${route}`
      if (wrong) confusion[wrong] = (confusion[wrong] ?? 0) + 1
    }
    return { name, binary, n, exact, searchRight, missedBrand, wastedSearch, confusion }
  })
}

// ── Markdown ───────────────────────────────────────────────────────────────
const f1 = (x) => (Number.isNaN(x) ? "–" : x.toFixed(1))
const pc = (x) => (Number.isNaN(x) ? "–" : `${Math.round(x * 100)}%`)
const usd = (x) => `$${(x * 1000).toFixed(2)}`
const sec = (ms) => (Number.isNaN(ms) ? "–" : `${(ms / 1000).toFixed(2)} s`)
const md = (cells) => `| ${cells.map((c) => String(c).replace(/\|/g, "/")).join(" | ")} |`
const table = (head, rows) => [md(head), md(head.map(() => "---")), ...rows.map(md)].join("\n")

export function report(run, foods = FOODS) {
  const foodsByText = new Map(foods.map((f) => [f.text, f]))
  const calls = run.calls.filter((c) => foodsByText.has(c.food))
  const hasJev = calls.some((c) => c.jroute)
  const pipes = PIPELINES.filter((p) => !p.needs || hasJev)
  const scored = pipes.map((p) => ({ p, s: score(p, calls, foodsByText) }))
  const out = []

  out.push(
    `Run ${run.startedAt}${run.mock ? " (MOCK: synthetic replies, plumbing test only)" : ""} · ` +
      `${run.gemini.model} (${run.gemini.backend}, thinking ${run.gemini.thinkingLevel ?? "default"}) · ` +
      `${run.jev ? run.jev.model : "no Jev key, Jev arms skipped"} · ${run.rounds} rounds × ${new Set(calls.map((c) => c.food)).size} foods · ` +
      `cascade prompt: ${run.cascadePrompt}`,
    ""
  )

  out.push("### Designs compared", "")
  out.push(
    table(
      ["Design", "Cost per 1,000 fills", "Searches per fill", "Median", "p90", "kcal within tolerance", "Median kcal error", "Right kind of reply", "Failed"],
      scored.map(({ p, s }) => [
        p.name, usd(s.all.cost), s.all.queries.toFixed(2), sec(s.all.msMed), sec(s.all.msP90),
        `${s.all.hits}/${s.all.refN}`, pc(s.all.medErr), pc(s.all.statusOk), s.all.failed,
      ])
    ),
    ""
  )

  out.push("### By kind of food", "")
  out.push(
    table(
      ["Design", "Kind", "Cost per 1,000", "Searched", "Median", "kcal within tolerance", "Median kcal error", "Right kind of reply"],
      scored.flatMap(({ p, s }) =>
        ["staple", "branded", "vague"].map((k) => {
          const b = s.byKind[k]
          return [p.name, k, usd(b.cost), pc(b.searched), sec(b.msMed), b.refN ? `${b.hits}/${b.refN}` : "–", pc(b.medErr), pc(b.statusOk)]
        })
      )
    ),
    ""
  )

  out.push("### Routing: does the decision step pick search for the right foods?", "")
  out.push(
    table(
      ["Router", "Decisions", "Right kind", "Right search call", "Brand not searched", "Search wasted", "Mix-ups"],
      routeAccuracy(calls, foodsByText).map((r) => [
        r.name, r.n, r.binary ? "–" : pc(r.exact / (r.n || 1)), pc(r.searchRight / (r.n || 1)), r.missedBrand, r.wastedSearch,
        Object.entries(r.confusion)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ") || "none",
      ])
    ),
    ""
  )

  const lat = (arm) => median(calls.map((c) => c[arm]?.ms).filter((x) => x > 0))
  out.push(
    "### Call speed",
    "",
    table(
      ["Call", "Median"],
      [
        ["Gemini with search", sec(lat("search"))],
        ["Gemini without search", sec(lat("plain"))],
        ["Gemini router", sec(lat("groute"))],
        ...(hasJev ? [["Jev router", sec(lat("jroute"))], ["Jev check", sec(lat("jcheck"))]] : []),
      ]
    ),
    ""
  )

  // Per food: median kcal per design next to the reference.
  const per = scored.map(({ p, s }) => ({ p, s }))
  out.push("### Per food (median kcal over rounds; ? = asked a question, s = searched at least once)", "")
  out.push(
    table(
      ["Food", "Kind", "Reference", ...per.map(({ p }) => p.id)],
      foods
        .filter((f) => calls.some((c) => c.food === f.text))
        .map((f) => [
          f.text, f.kind, f.ref ? `${f.ref.kcal} ±${Math.round(f.ref.tol * 100)}%` : "–",
          ...per.map(({ s }) => {
            const rs = s.rows.filter((r) => r.food === f)
            const kc = rs.filter((r) => isFood(r.result)).map((r) => r.result.food.calories)
            const asked = rs.filter((r) => r.result.status === "ambiguous").length
            const searched = rs.some((r) => r.searched)
            return `${kc.length ? Math.round(median(kc)) : ""}${asked ? ` ?${asked}` : ""}${searched ? " s" : ""}`.trim() || "–"
          }),
        ])
    ),
    ""
  )

  const t = scored[0].s.all
  out.push(
    "### Other checks",
    "",
    `- Atwater gap (|4P + 4C + 9F − kcal| / kcal, median): ${scored.map(({ p, s }) => `${p.id} ${pc(s.all.atwater)}`).join(" · ")}`,
    `- Imperial units in servingText: ${scored.map(({ p, s }) => `${p.id} ${s.all.imperial}`).join(" · ")}`,
    `- Today's design for reference: ${usd(t.cost)} per 1,000 fills, ${t.queries.toFixed(2)} searches per fill.`,
    `- Prices: Gemini $${PRICES.geminiInPerM}/$${PRICES.geminiOutPerM} per 1M in/out, search $${PRICES.searchPerQuery * 1000} per 1,000 queries, Jev $${PRICES.jevInPerM} per 1M input.`
  )
  return out.join("\n")
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = JSON.parse(readFileSync(process.argv[2], "utf8"))
  console.log(report(run))
}

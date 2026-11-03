// Markdown report for one bench run. Every report has the same sections, so
// any two runs can be read side by side: setup, variants, results, paired
// comparison with the baseline, by kind of food, search decisions, the food
// table, per food, other checks, and takeaways written by hand afterwards.
import { isFood, median, paired, scoreRecord, summarise } from "./score.mjs"
import { MODEL_PRICES, SEARCH_PER_QUERY } from "./prices.mjs"

const pc = (x) => (x === null || Number.isNaN(x) ? "–" : `${Math.round(x * 100)}%`)
const pc1 = (x) => (x === null || Number.isNaN(x) ? "–" : `${(x * 100).toFixed(1)}%`)
const usd1k = (x) => (Number.isNaN(x) ? "–" : `$${(x * 1000).toFixed(2)}`)
const sec = (ms) => (Number.isNaN(ms) ? "–" : `${(ms / 1000).toFixed(2)} s`)
const g1 = (x) => (Number.isNaN(x) ? "–" : `${x.toFixed(1)} g`)
const md = (cells) => `| ${cells.map((c) => String(c).replace(/\|/g, "/").replace(/\n/g, " ")).join(" | ")} |`
const table = (head, rows) => [md(head), md(head.map(() => "---")), ...rows.map(md)].join("\n")
const ci = (p, f) => (p ? `${f(p.diff)} (${f(p.lo)} to ${f(p.hi)})` : "–")
const signed = (f) => (x) => `${x > 0 ? "+" : x < 0 ? "−" : "±"}${f(Math.abs(x))}`

export function buildReport(run, foods) {
  const foodByText = new Map(foods.map((f) => [f.text, f]))
  const rows = run.records
    .filter((r) => foodByText.has(r.food))
    .map((r) => {
      const food = foodByText.get(r.food)
      // Runs before 856f934 didn't store jev-table's misses; the trace has them.
      const miss = r.tableHit || r.tableMiss ? undefined : (r.trace ?? []).find((c) => c.step?.startsWith("table") && c.out && !c.out.result)?.out.reason
      return { ...r, ...(miss ? { tableMiss: miss } : {}), food, s: scoreRecord(r, food) }
    })
  const ids = run.variants.map((v) => v.id)
  const of = (id) => rows.filter((r) => r.variant === id)
  const sum = Object.fromEntries(ids.map((id) => [id, summarise(of(id))]))
  const base = run.baseline ?? ids[0]
  const kinds = ["staple", "branded", "vague"]
  const out = []

  out.push(`# AI fill bench: ${run.name} (${run.startedAt.slice(0, 10)})`, "")
  out.push(`_${run.purpose || "Purpose not given (pass --purpose)."}_`, "")

  // ── Setup ──
  const foodsUsed = [...new Set(rows.map((r) => r.food.text))]
  const k = Object.fromEntries(kinds.map((kd) => [kd, foodsUsed.filter((t) => foodByText.get(t).kind === kd).length]))
  const jevResolved = [...new Set(rows.flatMap((r) => r.trace ?? []).map((c) => c.resolved).filter(Boolean))]
  out.push(
    "## Setup",
    "",
    table(
      ["", ""],
      [
        ["Run", `${run.startedAt}${run.mock ? " · **MOCK: synthetic replies, the numbers mean nothing**" : ""}`],
        ["Code", `${run.git.branch} @ ${run.git.commit}${run.git.dirty ? " (uncommitted changes)" : ""}`],
        ["Machine", `${run.machine} · Node ${run.node} · Gemini via ${run.backend}`],
        ["Foods", `set ${run.foodsVersion}: ${foodsUsed.length} foods (${k.staple} staples, ${k.branded} brands, ${k.vague} vague), ${foodsUsed.filter((t) => foodByText.get(t).ref).length} with a reference`],
        ["Rounds", `${run.rounds} (each food once per round; variants in shuffled order; a step shared by variants runs once per food and round)`],
        ["Baseline", base],
        ...Object.entries(run.prompts).map(([name, p]) => [`Prompt ${name}`, `${p.source} · sha ${p.sha}`]),
        ["Jev", jevResolved.length ? `resolved to ${jevResolved.join(", ")}` : "not used"],
        ...(run.table ? [["Food table", `${run.table.source} · ${run.table.count} foods`]] : []),
        ["Prices", `search $${SEARCH_PER_QUERY * 1000} per 1,000 queries; ${[...new Set(rows.flatMap((r) => r.trace ?? []).map((c) => c.model))].map((m) => `${m} $${MODEL_PRICES[m]?.input}/$${MODEL_PRICES[m]?.output} per 1M in/out`).join("; ")}`],
      ]
    ),
    ""
  )

  // ── Variants ──
  out.push("## Variants", "", table(["Variant", "What it does"], run.variants.map((v) => [`\`${v.id}\``, v.describe])), "")

  // ── Results ──
  out.push(
    "## Results",
    "",
    table(
      ["Variant", "Per 1,000 fills", "Searches per fill", "Median", "p90", "kcal within tolerance", "Mean kcal error", "Mean macro error", "Right kind of reply", "Right search call", "Failed"],
      ids.map((id) => {
        const s = sum[id]
        return [`\`${id}\``, usd1k(s.cost), s.queries.toFixed(2), sec(s.msMed), sec(s.msP90), `${s.hits}/${s.refN}`, pc1(s.meanKcalErr), g1(s.meanMacroErr), pc(s.statusOk), pc(s.searchRight), s.failed]
      })
    ),
    "",
    "Mean macro error is the mean absolute error of protein, fat and carbs in grams against the reference. Right search call: a search step for brands, none for staples and vague input (foods where either is defensible always count as right).",
    ""
  )

  // ── Against the baseline ──
  const others = ids.filter((id) => id !== base)
  if (others.length) {
    const B = of(base)
    out.push(
      `## Against \`${base}\``,
      "",
      "Differences are per food (averaged over rounds), with a 95% bootstrap interval over foods. An interval that excludes zero is a real difference on this food set.",
      "",
      table(
        ["Variant", "Cost per 1,000 fills", "Mean latency", "kcal within tolerance", "Right kind of reply"],
        others.map((id) => {
          const V = of(id)
          return [
            `\`${id}\``,
            ci(paired(V, B, (r) => r.s.cost * 1000), signed((x) => `$${x.toFixed(2)}`)),
            ci(paired(V, B, (r) => r.s.ms / 1000), signed((x) => `${x.toFixed(2)} s`)),
            ci(paired(V, B, (r) => (r.s.hit === null ? null : r.s.hit ? 100 : 0)), signed((x) => `${x.toFixed(0)} pts`)),
            ci(paired(V, B, (r) => (r.s.statusOk ? 100 : 0)), signed((x) => `${x.toFixed(0)} pts`)),
          ]
        })
      ),
      ""
    )
  }

  // ── By kind ──
  out.push(
    "## By kind of food",
    "",
    table(
      ["Variant", "Kind", "Per 1,000", "Searched", "Median", "kcal within tolerance", "Mean kcal error", "Right kind of reply"],
      ids.flatMap((id) =>
        kinds.map((kd) => {
          const s = summarise(of(id).filter((r) => r.food.kind === kd))
          return [`\`${id}\``, kd, usd1k(s.cost), pc(s.searched), sec(s.msMed), s.refN ? `${s.hits}/${s.refN}` : "–", pc1(s.meanKcalErr), pc(s.statusOk)]
        })
      )
    ),
    ""
  )

  // ── Search decisions ──
  const mixups = (id) => {
    const c = {}
    for (const r of of(id)) {
      if (r.route === undefined || r.route === null) continue
      const ok = [r.food.kind, ...(r.food.alsoOk ?? [])]
      if (!ok.includes(r.route) && !(r.route === "not-branded" && r.food.kind !== "branded")) {
        c[`${r.food.kind}→${r.route}`] = (c[`${r.food.kind}→${r.route}`] ?? 0) + 1
      }
    }
    return Object.entries(c).map(([k2, v]) => `${k2} ${v}`).join(", ") || "none"
  }
  out.push(
    "## Search decisions",
    "",
    table(
      ["Variant", "Right search call", "Brands not searched", "Searches wasted", "Router mix-ups"],
      ids.map((id) => [`\`${id}\``, pc(sum[id].searchRight), sum[id].brandMissed, sum[id].searchWasted, of(id).some((r) => r.route !== undefined) ? mixups(id) : "–"])
    ),
    ""
  )

  // ── Food table ──
  const tableIds = ids.filter((id) => of(id).some((r) => r.tableHit || r.tableMiss))
  if (tableIds.length) {
    out.push("## Food table", "")
    for (const id of tableIds) {
      const hits = of(id).filter((r) => r.tableHit)
      const tried = of(id).filter((r) => r.tableHit || r.tableMiss)
      const wrong = hits.filter((r) => r.s.hit === false)
      out.push(
        `\`${id}\`: answered from the table on ${hits.length} of ${tried.length} tries; ${wrong.length} of those were outside tolerance${wrong.length ? ` (${[...new Set(wrong.map((r) => `${r.food.text} → ${r.result.food.calories} kcal, ${r.result.food.servingText}`))].join("; ")})` : ""}.`,
        ""
      )
      const misses = {}
      for (const r of tried.filter((x) => x.tableMiss)) misses[r.tableMiss.replace(/\(.*\)/, "").trim()] = (misses[r.tableMiss.replace(/\(.*\)/, "").trim()] ?? 0) + 1
      if (Object.keys(misses).length) out.push(`Misses: ${Object.entries(misses).map(([k2, v]) => `${k2} ${v}`).join(", ")}.`, "")
      const vagueHits = hits.filter((r) => r.food.kind !== "staple")
      if (vagueHits.length) out.push(`Answered from the table but not a staple: ${[...new Set(vagueHits.map((r) => r.food.text))].join(", ")}.`, "")
      const held = tried.filter((r) => r.food.set === "heldout")
      if (held.length) {
        const fm = hits.filter((r) => r.food.set === "heldout")
        out.push(
          `False matches on the held-out set (foods not in the table): ${fm.length} of ${held.length} tries${fm.length ? `: ${[...new Set(fm.map((r) => `${r.food.text} → ${r.tableHit} (${r.result.food.calories} kcal, reference ${r.food.ref?.kcal ?? "–"})`))].join("; ")}` : ""}.`,
          ""
        )
      }
    }
  }

  // ── Per food ──
  out.push(
    "## Per food",
    "",
    "Median kcal over rounds. `?2` = asked a question twice, `s` = searched at least once, `t` = answered from the food table at least once.",
    "",
    table(
      ["Food", "Kind", "Reference", ...ids.map((id) => `\`${id}\``)],
      foods
        .filter((f) => foodsUsed.includes(f.text))
        .map((f) => [
          f.text, f.kind, f.ref ? `${f.ref.kcal} ±${f.ref.tolAbs && f.ref.tolAbs > f.ref.tol * f.ref.kcal ? f.ref.tolAbs : `${Math.round(f.ref.tol * 100)}%`}` : "–",
          ...ids.map((id) => {
            const rs = of(id).filter((r) => r.food === f)
            const kc = rs.filter((r) => isFood(r.result)).map((r) => r.result.food.calories)
            const asked = rs.filter((r) => r.result?.status === "ambiguous").length
            const flags = `${asked ? ` ?${asked}` : ""}${rs.some((r) => r.s.searchStep) ? " s" : ""}${rs.some((r) => r.tableHit) ? " t" : ""}`
            return `${kc.length ? Math.round(median(kc)) : ""}${flags}`.trim() || "–"
          }),
        ])
    ),
    ""
  )

  // ── Other checks ──
  out.push(
    "## Other checks",
    "",
    table(
      ["Variant", "kcal spread across rounds (median)", "Atwater gap (median)", "Imperial units in servingText"],
      ids.map((id) => [`\`${id}\``, pc1(sum[id].spread), pc1(sum[id].atwater), sum[id].imperial])
    ),
    "",
    "Spread: (max − min) / median kcal of a food over rounds. Atwater gap: |4P + 4C + 9F − kcal| / kcal.",
    ""
  )

  const errors = rows.flatMap((r) => (r.trace ?? []).filter((c) => c.error).map((c) => `${r.variant} · ${r.food.text}: ${c.error}`))
  if (errors.length) out.push("## Errors", "", ...[...new Set(errors)].slice(0, 20).map((e) => `- ${e}`), "")

  out.push("## Takeaways", "", "_Written after review: what the numbers show, what they don't, and what to test next._", "")
  out.push(`Raw calls: \`${run.rawFile}\`. Re-make this report with \`node scripts/ai-bench/bench.mjs report ${run.rawFile}\`.`)
  return out.join("\n")
}

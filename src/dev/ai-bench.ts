// Latency/quality bench for AI macro-fill at /ai-bench.html: served by the
// dev server and by AI_BENCH=1 builds (see vite.config.ts). It calls Gemini
// from the browser in the single-call shape (src/dev/ai-bench-model.ts), so it
// compares models and prompts; production's two-step fill runs in the aiFill
// function and logs its own timings (ADR 0016).

import { createModel, type AiModelConfig } from "@/dev/ai-bench-model"
import { parseMacroFillResponse } from "@/lib/macro-fill"

const CONFIGS: (AiModelConfig & { name: string })[] = [
  {
    name: "3.1 Flash-Lite · default",
    model: "gemini-3.1-flash-lite",
    thinkingLevel: null,
  },
  {
    name: "3.5 Flash-Lite · default",
    model: "gemini-3.5-flash-lite",
    thinkingLevel: null,
  },
  {
    name: "3.5 Flash-Lite · LOW",
    model: "gemini-3.5-flash-lite",
    thinkingLevel: "LOW",
  },
]

// Staples (should resolve ungrounded), branded/regional foods (should
// search), and vague inputs (should ask a question).
const FOODS = [
  "1 banana",
  "2 scrambled eggs with 10 g butter",
  "200 g cooked white rice",
  "Big Mac",
  "Starbucks grande oat milk latte",
  "alfajor Havanna chocolate",
  "Chobani vanilla greek yogurt 150 g",
  "empanada de carne",
  "a bowl of pasta",
  "sandwich",
]

interface Call {
  config: string
  food: string
  ms: number
  status: string
  grounded: boolean
  queries: number
  thoughts: number
  summary: string
  error?: string
}

const $ = (id: string) => document.getElementById(id)!

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return NaN
  const i = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  )
  return sorted[Math.max(0, i)]
}

async function runOne(
  model: Awaited<ReturnType<typeof createModel>>,
  config: string,
  food: string
): Promise<Call> {
  const t0 = performance.now()
  try {
    const { response } = await model.generateContent(food)
    const ms = Math.round(performance.now() - t0)
    const meta = response.candidates?.[0]?.groundingMetadata
    const result = parseMacroFillResponse(response.text())
    let summary = "(not in contract shape)"
    if (result) {
      if (result.status === "confident" || result.status === "unsure") {
        const f = result.food
        summary = `${f.label} · ${f.servingText} · ${f.calories} kcal · P${f.protein_g} F${f.fat_g} C${f.carbs_g}`
      } else if (result.status === "ambiguous") {
        summary = `? ${result.question}`
      } else {
        summary = `hint: ${result.hint}`
      }
    }
    return {
      config,
      food,
      ms,
      status: result?.status ?? "invalid",
      grounded: Boolean(meta?.searchEntryPoint?.renderedContent),
      queries: meta?.webSearchQueries?.length ?? 0,
      thoughts: response.usageMetadata?.thoughtsTokenCount ?? 0,
      summary,
    }
  } catch (e) {
    return {
      config,
      food,
      ms: Math.round(performance.now() - t0),
      status: "error",
      grounded: false,
      queries: 0,
      thoughts: 0,
      summary: "",
      error: String(e),
    }
  }
}

function esc(s: string) {
  return s.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!
  )
}

function render(calls: Call[]) {
  const rows = CONFIGS.map(({ name }) => {
    const mine = calls.filter((c) => c.config === name)
    const ok = mine.filter((c) => c.status !== "error")
    const all = ok.map((c) => c.ms).sort((a, b) => a - b)
    const g = ok
      .filter((c) => c.grounded)
      .map((c) => c.ms)
      .sort((a, b) => a - b)
    const u = ok
      .filter((c) => !c.grounded)
      .map((c) => c.ms)
      .sort((a, b) => a - b)
    const thoughts = ok.length
      ? Math.round(ok.reduce((s, c) => s + c.thoughts, 0) / ok.length)
      : 0
    return {
      name,
      n: mine.length,
      errors: mine.length - ok.length,
      median: percentile(all, 50),
      p90: percentile(all, 90),
      groundedMedian: percentile(g, 50),
      ungroundedMedian: percentile(u, 50),
      grounded: g.length,
      thoughts,
    }
  })
  const head = [
    "Config",
    "Calls",
    "Errors",
    "Median ms",
    "p90 ms",
    "Grounded median ms",
    "Ungrounded median ms",
    "Grounded calls",
    "Avg thought tokens",
  ]
  const vals = (r: (typeof rows)[number]) =>
    [
      r.name,
      r.n,
      r.errors,
      r.median,
      r.p90,
      r.groundedMedian,
      r.ungroundedMedian,
      r.grounded,
      r.thoughts,
    ].map((v) => (Number.isNaN(v) ? "–" : String(v)))
  $("summary").innerHTML =
    `<table><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>` +
    rows
      .map(
        (r) =>
          `<tr>${vals(r)
            .map((v, i) => `<td class="${i ? "n" : ""}">${esc(v)}</td>`)
            .join("")}</tr>`
      )
      .join("") +
    "</table>"

  const callHead = [
    "Food",
    "Config",
    "ms",
    "Status",
    "Grounded",
    "Queries",
    "Thoughts",
    "Answer",
  ]
  const callVals = (c: Call) => [
    c.food,
    c.config,
    String(c.ms),
    c.status,
    c.grounded ? "yes" : "",
    String(c.queries),
    String(c.thoughts),
    c.error ?? c.summary,
  ]
  $("calls").innerHTML =
    `<table><tr>${callHead.map((h) => `<th>${h}</th>`).join("")}</tr>` +
    calls
      .map(
        (c) =>
          `<tr>${callVals(c)
            .map((v) => `<td>${esc(v)}</td>`)
            .join("")}</tr>`
      )
      .join("") +
    "</table>"

  const mdRow = (cells: string[]) =>
    `| ${cells.map((c) => c.replace(/\|/g, "/")).join(" | ")} |`
  $("md").textContent = [
    mdRow(head),
    mdRow(head.map(() => "---")),
    ...rows.map((r) => mdRow(vals(r))),
    "",
    mdRow(callHead),
    mdRow(callHead.map(() => "---")),
    ...calls.map((c) => mdRow(callVals(c))),
  ].join("\n")
}

$("run").addEventListener("click", async () => {
  const button = $("run") as HTMLButtonElement
  button.disabled = true
  const rounds = Number(($("rounds") as HTMLInputElement).value) || 1
  const models = await Promise.all(CONFIGS.map((c) => createModel(c)))
  const calls: Call[] = []
  const total = rounds * FOODS.length * CONFIGS.length
  // Interleave configs per food so network drift hits all of them alike.
  for (let r = 0; r < rounds; r++) {
    for (const food of FOODS) {
      for (let i = 0; i < CONFIGS.length; i++) {
        $("progress").textContent = `${calls.length + 1} / ${total}`
        calls.push(await runOne(models[i], CONFIGS[i].name, food))
        render(calls)
      }
    }
  }
  $("progress").textContent = "done"
  button.disabled = false
})

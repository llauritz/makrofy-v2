#!/usr/bin/env node
// Router bench for AI fills: is a cheap decision step (Jev, or Gemini itself)
// good enough to skip Google Search on most fills without hurting the numbers?
//
// For every food and round it makes the same raw calls once, then the report
// (report.mjs) combines them into whole pipelines, so every design is scored
// on the very same Gemini answers:
//   search  – production request: Gemini + Google Search (today's fill)
//   plain   – the same prompt with no search tool
//   cascade – no-search first call that may reply {"status":"search"}
//   groute  – Gemini as a three-way router (staple / branded / vague)
//   jroute  – Jev: the same three-way choice, plus a yes/no "needs search"
//   jcheck  – Jev: is the no-search answer plausible enough to keep?
//
// Usage (Node 22.18+, from the repo root):
//   node scripts/ai-bench/run.mjs [--rounds 3] [--only "Big Mac,sandwich"] [--mock]
// Needs `gcloud auth login` with access to the goyaffle project (or
// GEMINI_API_KEY), and TYPESAFE_API_KEY for the Jev arms (skipped without it).
// Writes docs/research/ai-bench/runs/<timestamp>-router.json and prints the report.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { parseMacroFillResponse } from "../../src/lib/macro-fill.ts"
import { geminiClient, jevClient, mockClients } from "./clients.mjs"
import { FOODS } from "./foods.mjs"
import {
  fillSchema,
  GEMINI_ROUTER_PROMPT,
  GEMINI_ROUTER_SCHEMA,
  JEV_CHECK_QUESTIONS,
  JEV_ROUTER_QUESTIONS,
  loadCascadePrompt,
  SYSTEM_PROMPT,
} from "./prompts.mjs"
import { report } from "./report.mjs"

const { values: args } = parseArgs({
  options: {
    rounds: { type: "string", default: "3" },
    only: { type: "string" },
    concurrency: { type: "string", default: "3" },
    mock: { type: "boolean", default: false },
    project: { type: "string", default: "goyaffle" },
    model: { type: "string", default: "gemini-3.5-flash-lite" },
    thinking: { type: "string", default: "LOW" },
    jev: { type: "string", default: "jev-latest" },
    out: { type: "string" },
    "add-jev": { type: "string" },
  },
})

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

// Keys may live in the git-ignored .env.local instead of the shell.
const envFile = join(root, ".env.local")
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*(TYPESAFE_API_KEY|GEMINI_API_KEY)\s*=\s*"?([^"\s]+)"?/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
const only = args.only?.split(",").map((s) => s.trim())
const foods = only ? FOODS.filter((f) => only.includes(f.text)) : FOODS
const rounds = Number(args.rounds)

const { gemini, jev } = args.mock
  ? mockClients(FOODS)
  : {
      gemini: geminiClient({ project: args.project, model: args.model, thinkingLevel: args.thinking || null }),
      jev: jevClient({ model: args.jev }),
    }
const cascade = await loadCascadePrompt()

/** Parse a fill reply; the cascade arm may also say "search". */
function parseFill(text, allowSearch) {
  if (allowSearch) {
    try {
      if (JSON.parse(text)?.status === "search") return { status: "search" }
    } catch {
      // fall through: the contract parser reports it as invalid
    }
  }
  return parseMacroFillResponse(text ?? "") ?? { status: "invalid" }
}

async function fill(user, system, search, allowSearch = false) {
  const schema = fillSchema(
    allowSearch ? ["confident", "unsure", "ambiguous", "hopeless", "search"] : undefined
  )
  const r = await gemini.generate({ system, user, schema, search })
  return { ...r, result: r.error ? { status: "error" } : parseFill(r.text, allowSearch) }
}

async function runFood(food, round) {
  const raw = { food: food.text, round }
  const user = food.text
  // Independent calls, in a shuffled order so drift doesn't favour one arm.
  const tasks = {
    search: () => fill(user, SYSTEM_PROMPT, true),
    plain: () => fill(user, SYSTEM_PROMPT, false),
    cascade: () => fill(user, cascade.prompt, false, true),
    groute: async () => {
      const r = await gemini.generate({ system: GEMINI_ROUTER_PROMPT, user, schema: GEMINI_ROUTER_SCHEMA, search: false })
      let route = null
      try {
        route = JSON.parse(r.text).route ?? null
      } catch {
        // invalid reply: route stays null
      }
      return { ...r, route }
    },
    ...(jev && {
      jroute: () => jev.decide({ state: { entry: food.text }, questions: JEV_ROUTER_QUESTIONS }),
    }),
  }
  const order = Object.keys(tasks).sort(() => Math.random() - 0.5)
  for (const k of order) raw[k] = await tasks[k]()
  await jevCheck(raw)
  // Raw text isn't needed in the saved file once parsed; keep it short.
  for (const k of ["search", "plain", "cascade", "groute"]) {
    if (raw[k]?.text) raw[k].text = raw[k].text.slice(0, 600)
  }
  return raw
}

/** The checker needs the no-search answer first. */
async function jevCheck(raw) {
  const p = raw.plain.result
  if (jev && (p.status === "confident" || p.status === "unsure")) {
    const f = p.food
    raw.jcheck = await jev.decide({
      state: {
        entry: raw.food,
        answer: {
          label: f.label, serving: f.servingText, grams: f.grams,
          kcal: f.calories, protein_g: f.protein_g, fat_g: f.fat_g, carbs_g: f.carbs_g,
        },
      },
      questions: JEV_CHECK_QUESTIONS,
    })
  }
}

// --add-jev <run.json>: add the Jev arms to a saved run, reusing its Gemini
// answers (no Gemini calls, no search fees).
if (args["add-jev"]) {
  if (!jev) throw new Error("TYPESAFE_API_KEY is not set (shell or .env.local)")
  const file = args["add-jev"]
  const saved = JSON.parse(readFileSync(file, "utf8"))
  let i = 0
  for (const raw of saved.calls) {
    raw.jroute = await jev.decide({ state: { entry: raw.food }, questions: JEV_ROUTER_QUESTIONS })
    await jevCheck(raw)
    process.stderr.write(`\r${++i}/${saved.calls.length}`)
  }
  process.stderr.write("\n")
  saved.jev = { model: jev.model }
  writeFileSync(file, JSON.stringify(saved, null, 1))
  console.error(`updated: ${file}`)
  console.log(report(saved, FOODS))
  process.exit(0)
}

const jobs = []
for (let r = 0; r < rounds; r++) for (const f of foods) jobs.push([f, r])
const calls = []
let next = 0
let done = 0
async function worker() {
  while (next < jobs.length) {
    const [f, r] = jobs[next++]
    calls.push(await runFood(f, r))
    done++
    process.stderr.write(`\r${done}/${jobs.length} ${f.text.padEnd(40).slice(0, 40)}`)
  }
}
await Promise.all(Array.from({ length: Number(args.concurrency) }, worker))
process.stderr.write("\n")

const run = {
  startedAt: new Date().toISOString(),
  mock: args.mock,
  gemini: { backend: gemini.backend, model: gemini.model, thinkingLevel: gemini.thinkingLevel },
  jev: jev ? { model: jev.model } : null,
  cascadePrompt: cascade.source,
  rounds,
  calls,
}
const stamp = run.startedAt.replace(/[:.]/g, "-").slice(0, 19)
const out =
  args.out ?? join(root, "docs/research/ai-bench/runs", `${stamp}-router${args.mock ? "-mock" : ""}.json`)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(run, null, 1))
console.error(`raw calls: ${out}`)
console.log(report(run, FOODS))

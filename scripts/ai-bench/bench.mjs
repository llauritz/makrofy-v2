#!/usr/bin/env node
// AI fill bench: compare models and pipelines on the same labelled foods.
//
//   node scripts/ai-bench/bench.mjs list
//   node scripts/ai-bench/bench.mjs run --name <slug> --purpose "<why>" \
//        --variants "today cascade jev-router:jev=jev-1.13.0" [--rounds 3] [--baseline today]
//        [--set main|heldout|all] [--only "Big Mac,sandwich"] [--kinds staple,branded] [--prompts-ref origin/main]
//        [--project goyaffle] [--concurrency 3] [--mock]
//   node scripts/ai-bench/bench.mjs report <raw run.json>
//
// `run` writes the raw calls to docs/research/ai-bench/runs/<date>-<name>.json,
// the report to docs/research/ai-bench/<date>-<name>.md, and adds a row to
// docs/research/ai-bench/README.md. See scripts/ai-bench/README.md.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { platform, arch } from "node:os"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { geminiClient, jevClient, mockClients } from "./lib/clients.mjs"
import { buildReport } from "./lib/report.mjs"
import { foodContext } from "./lib/steps.mjs"
import { loadTable } from "./lib/table.mjs"
import { ALL_FOODS, FOODS, FOODS_VERSION, HELDOUT, HELDOUT_REFS, HELDOUT_VERSION } from "./foods.mjs"
import { loadPrompts } from "./prompts.mjs"
import { parseVariant, VARIANTS } from "./variants.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
process.chdir(root)
const docs = "docs/research/ai-bench"

// Keys may live in the git-ignored .env.local instead of the shell.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*(TYPESAFE_API_KEY|GEMINI_API_KEY)\s*=\s*"?([^"\s]+)"?/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const [command, ...rest] = process.argv.slice(2)
const { values: args, positionals } = parseArgs({
  args: rest,
  allowPositionals: true,
  options: {
    name: { type: "string" },
    purpose: { type: "string", default: "" },
    variants: { type: "string" },
    baseline: { type: "string" },
    rounds: { type: "string", default: "3" },
    only: { type: "string" },
    kinds: { type: "string" },
    set: { type: "string", default: "main" },
    "prompts-ref": { type: "string" },
    project: { type: "string", default: "goyaffle" },
    concurrency: { type: "string", default: "3" },
    mock: { type: "boolean", default: false },
  },
})

const git = (...a) => {
  try {
    return execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return "?"
  }
}

/** Write the report, keeping hand-written takeaways from an earlier version. */
function writeReport(run, mdFile) {
  let text = buildReport(run, ALL_FOODS)
  if (existsSync(mdFile)) {
    const old = readFileSync(mdFile, "utf8").match(/## Takeaways\n([\s\S]*?)\nRaw calls:/)
    if (old && !old[1].includes("_Written after review")) {
      text = text.replace(/## Takeaways\n[\s\S]*?\nRaw calls:/, `## Takeaways\n${old[1]}\nRaw calls:`)
    }
  }
  writeFileSync(mdFile, text + "\n")
}

function addToIndex(run, mdFile) {
  const index = join(docs, "README.md")
  const head = `# AI fill bench runs

Every bench run, newest first. Each report has the same sections (setup, variants, results, paired comparison with the baseline, by kind of food, search decisions, per food, takeaways), so runs can be compared side by side. How to run one: \`scripts/ai-bench/README.md\`.

| Date | Run | Purpose | Variants | Foods × rounds |
| --- | --- | --- | --- | --- |
`
  const body = existsSync(index) ? readFileSync(index, "utf8") : head
  const row = `| ${run.startedAt.slice(0, 10)} | [${run.name}](${relative(docs, mdFile)}) | ${run.purpose.replace(/\|/g, "/")} | ${run.variants.map((v) => `\`${v.id}\``).join(", ")} | ${new Set(run.records.map((r) => r.food)).size} × ${run.rounds} |`
  if (body.includes(`](${relative(docs, mdFile)})`)) return
  const marker = "| --- | --- | --- | --- | --- |\n"
  writeFileSync(index, body.replace(marker, marker + row + "\n"))
}

if (command === "list") {
  for (const [id, v] of Object.entries(VARIANTS)) console.log(`${id.padEnd(14)} ${v.describe}`)
  process.exit(0)
}

if (command === "report") {
  const file = positionals[0]
  if (!file) throw new Error("usage: bench.mjs report <raw run.json>")
  const run = JSON.parse(readFileSync(file, "utf8"))
  const mdFile = join(docs, `${run.startedAt.slice(0, 10)}-${run.name}.md`)
  writeReport(run, mdFile)
  console.log(`report: ${mdFile}`)
  process.exit(0)
}

if (command !== "run") {
  console.error("usage: bench.mjs list | run --name <slug> --variants a,b,c [options] | report <run.json>")
  process.exit(2)
}

if (!args.name || !/^[a-z0-9-]+$/.test(args.name)) throw new Error("--name <lowercase-slug> is required")
if (!args.variants) throw new Error("--variants is required (see `bench.mjs list`)")
// Variants are separated by spaces; options inside one use commas.
const variants = args.variants.trim().split(/\s+/).map(parseVariant)
const only = args.only?.split(",").map((s) => s.trim())
const kinds = args.kinds?.split(",")
const SETS = { main: FOODS, heldout: HELDOUT, all: ALL_FOODS }
if (!SETS[args.set]) throw new Error(`--set must be one of ${Object.keys(SETS).join(", ")}`)
if (args.set !== "main" && !HELDOUT_REFS && !args.mock) {
  throw new Error("No held-out references: run node scripts/ai-bench/data/build-heldout.mjs first.")
}
const foods = SETS[args.set].filter((f) => (!only || only.includes(f.text)) && (!kinds || kinds.includes(f.kind)))
const rounds = Number(args.rounds)

const { gemini, jev } = args.mock
  ? mockClients(ALL_FOODS)
  : { gemini: geminiClient({ project: args.project }), jev: jevClient() }
const prompts = await loadPrompts(args["prompts-ref"])
const table = loadTable({ mock: args.mock })

// Fail before spending anything when a variant can't run.
const needs = (b) => variants.some((v) => b.includes(v.base))
if (needs(["cascade", "jev-cascade", "table-jev", "jev-table"]) && !(prompts.ROUTING_PROMPT && prompts.SEARCH_PROMPT)) {
  throw new Error("The cascade needs functions/src/ai-prompt.ts: not in the working tree or at --prompts-ref (default origin/main).")
}
if (needs(["jev-router", "jev-yesno", "jev-cascade", "jev-check", "table-jev", "jev-table"]) && !jev) {
  throw new Error("Jev variants need TYPESAFE_API_KEY (shell or .env.local).")
}
if (needs(["table-jev", "jev-table"]) && !table) {
  throw new Error("No food table: run node scripts/ai-bench/data/build-food-table.mjs first.")
}

const records = []
const jobs = []
for (let r = 0; r < rounds; r++) for (const f of foods) jobs.push([f, r])
let next = 0
let done = 0
async function worker() {
  while (next < jobs.length) {
    const [food, round] = jobs[next++]
    const ctx = foodContext({ gemini, jev, prompts, table, text: food.text })
    // Variants for one food run one after another in a shuffled order, so a
    // shared step is timed once and drift doesn't favour one variant.
    for (const v of [...variants].sort(() => Math.random() - 0.5)) {
      const trace = []
      let out
      try {
        out = await VARIANTS[v.base].run(ctx.steps(trace), v.options)
      } catch (e) {
        out = { result: { status: "error" }, error: String(e.message ?? e) }
        if (/needs Jev|No food table|not available/.test(out.error)) throw e
      }
      records.push({ food: food.text, round, variant: v.id, ...out, trace })
    }
    process.stderr.write(`\r${++done}/${jobs.length} ${food.text.padEnd(40).slice(0, 40)}`)
  }
}
const startedAt = new Date().toISOString()
await Promise.all(Array.from({ length: Number(args.concurrency) }, worker))
process.stderr.write("\n")

const day = startedAt.slice(0, 10)
const rawFile = join(docs, "runs", `${day}-${args.name}${args.mock ? "-mock" : ""}.json`)
const mdFile = join(docs, `${day}-${args.name}${args.mock ? "-mock" : ""}.md`)
const run = {
  bench: 2,
  name: args.name + (args.mock ? "-mock" : ""),
  purpose: args.purpose,
  startedAt,
  mock: args.mock,
  git: { branch: git("rev-parse", "--abbrev-ref", "HEAD"), commit: git("rev-parse", "--short", "HEAD"), dirty: git("status", "--porcelain") !== "" },
  machine: `${platform()} ${arch()}`,
  node: process.versions.node,
  backend: gemini.backend,
  foodSet: args.set,
  foodsVersion: [args.set !== "heldout" && `main ${FOODS_VERSION}`, args.set !== "main" && `held-out ${HELDOUT_VERSION}`].filter(Boolean).join(" + "),
  rounds,
  baseline: args.baseline ?? variants[0].id,
  variants: variants.map(({ id, base, options, describe }) => ({ id, base, options, describe })),
  prompts: Object.fromEntries(Object.entries(prompts).map(([k, p]) => [k, { source: p.source, sha: p.sha }])),
  table: table ? { source: table.source, count: table.foods.length } : null,
  rawFile,
  records,
}
mkdirSync(dirname(rawFile), { recursive: true })
writeFileSync(rawFile, JSON.stringify(run, null, 1))
writeReport(run, mdFile)
if (!args.mock) addToIndex(run, mdFile)
console.log(`raw calls: ${rawFile}\nreport: ${mdFile}`)

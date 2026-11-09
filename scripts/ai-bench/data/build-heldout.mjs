#!/usr/bin/env node
// Builds heldout.json (the held-out staple set with references) from the
// USDA SR Legacy download and heldout.spec.mjs:
//   node scripts/ai-bench/data/build-heldout.mjs [--from <SR Legacy JSON>]
// It also checks that no held-out food is in the food table spec.
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { TABLE_SPEC } from "./food-table.spec.mjs"
import { HELDOUT_SPEC, HELDOUT_VERSION } from "./heldout.spec.mjs"
import { find, loadSrLegacy, per100, round1, SOURCE } from "./usda.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const { values: args } = parseArgs({ options: { from: { type: "string" } } })
const usda = await loadSrLegacy(args.from)

const inTable = new Set(TABLE_SPEC.map((s) => s.usda))
const missing = []
const foods = []
for (const spec of HELDOUT_SPEC) {
  const ref = { kcal: 0, p: 0, f: 0, c: 0 }
  const src = []
  for (const [description, grams] of spec.parts) {
    if (inTable.has(description)) missing.push(`${spec.text}: "${description}" is in the food table, so it isn't held out`)
    const { food, error } = find(usda, description, spec.text)
    if (error) {
      missing.push(error)
      continue
    }
    const v = per100(food, spec.text, missing)
    for (const k of Object.keys(ref)) ref[k] += (v[k] * grams) / 100
    src.push(`${food.description} (fdc ${food.fdcId}) ${round1(grams)} g`)
  }
  foods.push({
    text: spec.text,
    trap: spec.trap ?? null,
    ref: {
      kcal: Math.round(ref.kcal), p: round1(ref.p), f: round1(ref.f), c: round1(ref.c), tol: spec.tol,
      src: `${SOURCE}: ${src.join(" + ")}${spec.note ? `; ${spec.note}` : ""}`,
    },
  })
}

if (missing.length) {
  console.error(missing.join("\n"))
  process.exit(1)
}
const out = join(here, "heldout.json")
writeFileSync(out, JSON.stringify({ version: HELDOUT_VERSION, source: SOURCE, built: new Date().toISOString(), foods }, null, 1))
console.log(`${foods.length} held-out foods → ${out}`)
for (const f of foods) console.log(`${f.text.padEnd(44)} ${String(f.ref.kcal).padStart(4)} kcal  P ${f.ref.p}  F ${f.ref.f}  C ${f.ref.c}`)

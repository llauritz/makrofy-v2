#!/usr/bin/env node
// Builds food-table.json from the USDA FoodData Central "SR Legacy" download
// and food-table.spec.mjs. Run it once after changing the spec:
//   node scripts/ai-bench/data/build-food-table.mjs [--from <SR Legacy JSON>]
// Without --from it downloads the zip from USDA (about 12 MB) and unzips it
// with the system `unzip`.
//
// Values per 100 g: Energy (nutrient number 208, kcal), Protein (203), Total
// lipid (204), Carbohydrate by difference (205). Portions are USDA's gram
// weights, minus cups, spoons and ounces (the app is metric).
import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { TABLE_SPEC } from "./food-table.spec.mjs"

const ZIP = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip"
const here = dirname(fileURLToPath(import.meta.url))
const { values: args } = parseArgs({ options: { from: { type: "string" } } })

let file = args.from
if (!file) {
  const dir = mkdtempSync(join(tmpdir(), "usda-"))
  const zip = join(dir, "sr.zip")
  const res = await fetch(ZIP)
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${ZIP}`)
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
  execFileSync("unzip", ["-q", zip, "-d", dir])
  file = join(dir, readdirSync(dir).find((f) => f.endsWith(".json")))
}
const data = JSON.parse(readFileSync(file, "utf8"))
const foods = data.SRLegacyFoods ?? data.FoundationFoods ?? data
const byDesc = new Map(foods.map((f) => [f.description, f]))

const NUM = { kcal: "208", p: "203", f: "204", c: "205" }
const UNWANTED = /\b(cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|fl|lbs?|pounds?|pints?|quarts?|NLEA)\b/i
const round1 = (x) => Math.round(x * 10) / 10

const missing = []
const table = []
for (const spec of TABLE_SPEC) {
  const food = byDesc.get(spec.usda)
  if (!food) {
    const words = spec.usda.split(/[ ,]+/).filter((w) => w.length > 3).slice(0, 2)
    const near = foods
      .filter((f) => words.every((w) => f.description.includes(w)))
      .slice(0, 6)
      .map((f) => f.description)
    missing.push(`${spec.id}: "${spec.usda}" not found. Close: ${near.join(" | ") || "none"}`)
    continue
  }
  const per100 = {}
  for (const [k, n] of Object.entries(NUM)) {
    const hit = food.foodNutrients.find((x) => x.nutrient?.number === n)
    if (!hit) missing.push(`${spec.id}: no nutrient ${n}`)
    per100[k] = round1(hit?.amount ?? NaN)
  }
  const usdaPortions = (food.foodPortions ?? [])
    .map((p) => {
      const what = String(p.modifier ?? p.portionDescription ?? "")
        .replace(/\([^)]*("|\bin\b|inch)[^)]*\)/g, "") // sizes in inches
        .replace(/\s+/g, " ")
        .trim()
      return { label: `${p.amount ?? 1} ${what}`.trim(), grams: round1(p.gramWeight) }
    })
    .filter((p) => p.grams > 0 && !UNWANTED.test(p.label) && /[a-z]/i.test(p.label))
  table.push({
    id: spec.id,
    usda: { fdcId: food.fdcId, description: food.description },
    names: spec.names,
    per100,
    density: spec.density ?? null,
    portions: spec.portions ?? usdaPortions,
  })
}

if (missing.length) {
  console.error(missing.join("\n"))
  process.exit(1)
}
const out = join(here, "food-table.json")
writeFileSync(
  out,
  JSON.stringify({ source: "USDA FoodData Central, SR Legacy (April 2018)", built: new Date().toISOString(), foods: table }, null, 1)
)
console.log(`${table.length} foods → ${out}`)
for (const f of table) console.log(`${f.id.padEnd(24)} ${f.per100.kcal} kcal · ${f.portions.map((p) => `${p.label} ${p.grams} g`).join(", ")}`)

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
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { TABLE_SPEC } from "./food-table.spec.mjs"
import { find, loadSrLegacy, per100 as readPer100, round1, SOURCE } from "./usda.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const { values: args } = parseArgs({ options: { from: { type: "string" } } })
const usda = await loadSrLegacy(args.from)

const UNWANTED = /\b(cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|fl|lbs?|pounds?|pints?|quarts?|NLEA)\b/i

const missing = []
const table = []
for (const spec of TABLE_SPEC) {
  const { food, error } = find(usda, spec.usda, spec.id)
  if (error) {
    missing.push(error)
    continue
  }
  const per100 = readPer100(food, spec.id, missing)
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
  JSON.stringify({ source: SOURCE, built: new Date().toISOString(), foods: table }, null, 1)
)
console.log(`${table.length} foods → ${out}`)
for (const f of table) console.log(`${f.id.padEnd(24)} ${f.per100.kcal} kcal · ${f.portions.map((p) => `${p.label} ${p.grams} g`).join(", ")}`)

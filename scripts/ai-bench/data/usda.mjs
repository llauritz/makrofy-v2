// Shared reader for the USDA FoodData Central "SR Legacy" download, used by
// build-food-table.mjs and build-heldout.mjs. Without `from` it downloads the
// zip from USDA (about 12 MB) and unzips it with the system `unzip`.
import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ZIP = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip"
export const SOURCE = "USDA FoodData Central, SR Legacy (April 2018)"

// Energy (kcal), protein, total lipid, carbohydrate by difference.
const NUM = { kcal: "208", p: "203", f: "204", c: "205" }
export const round1 = (x) => Math.round(x * 10) / 10

export async function loadSrLegacy(from) {
  let file = from
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
  return { foods, byDesc: new Map(foods.map((f) => [f.description, f])), file }
}

/** Exact-description lookup; on a miss, an error line listing close descriptions. */
export function find(usda, description, label) {
  const food = usda.byDesc.get(description)
  if (food) return { food }
  const words = description.split(/[ ,]+/).filter((w) => w.length > 3).slice(0, 2)
  const near = usda.foods
    .filter((f) => words.every((w) => f.description.includes(w)))
    .slice(0, 6)
    .map((f) => f.description)
  return { error: `${label}: "${description}" not found. Close: ${near.join(" | ") || "none"}` }
}

/** Per-100 g kcal, protein, fat, carbs; `missing` collects absent nutrients. */
export function per100(food, label, missing) {
  const out = {}
  for (const [k, n] of Object.entries(NUM)) {
    const hit = food.foodNutrients.find((x) => x.nutrient?.number === n)
    if (!hit) missing.push(`${label}: no nutrient ${n}`)
    out[k] = round1(hit?.amount ?? NaN)
  }
  return out
}

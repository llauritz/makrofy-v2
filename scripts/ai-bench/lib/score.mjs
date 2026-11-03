// Scoring for bench runs. Every record is one variant's fill of one food in
// one round; the scores below are computed per variant, per kind of food,
// and as paired differences against a baseline variant.

export const isFood = (r) => r?.status === "confident" || r?.status === "unsure"
export const median = (xs) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
export const pct = (xs, p) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const IMPERIAL = /\b(oz|ounces?|cups?|tbsp|tsp|tablespoons?|teaspoons?|lbs?|pounds?|inch(es)?|fl\.? ?oz)\b|\d"/i

/** Wanted search decision for a food: true (search), false, or null (either is fine). */
function wantsSearch(food) {
  const ok = [food.kind, ...(food.alsoOk ?? [])]
  const yes = ok.includes("branded")
  const no = ok.some((k) => k !== "branded")
  return yes && no ? null : yes
}

/** Per-record metrics. */
export function scoreRecord(rec, food) {
  const r = rec.result ?? { status: "error" }
  const trace = rec.trace ?? []
  const ref = food.ref
  const out = {
    ms: trace.reduce((s, c) => s + (c.ms ?? 0), 0),
    cost: trace.reduce((s, c) => s + (c.cost ?? 0), 0),
    queries: trace.reduce((s, c) => s + (c.queries ?? 0), 0),
    searchStep: trace.some((c) => (c.queries ?? 0) > 0),
    failed: r.status === "invalid" || r.status === "error" || trace.some((c) => c.error),
    statusOk: food.accept.includes(r.status),
    hit: null, kcalErr: null, macroErr: null, atwater: null,
    imperial: isFood(r) && IMPERIAL.test(r.food.servingText ?? ""),
    kcal: isFood(r) ? r.food.calories : null,
  }
  const want = wantsSearch(food)
  out.searchRight = want === null ? true : out.searchStep === want
  out.brandMissed = want === true && !out.searchStep
  out.searchWasted = want === false && out.searchStep
  if (ref) {
    if (isFood(r)) {
      const f = r.food
      const abs = Math.abs(f.calories - ref.kcal)
      out.kcalErr = abs / ref.kcal
      out.hit = abs <= Math.max(ref.tol * ref.kcal, ref.tolAbs ?? 0)
      out.macroErr = (Math.abs(f.protein_g - ref.p) + Math.abs(f.fat_g - ref.f) + Math.abs(f.carbs_g - ref.c)) / 3
    } else out.hit = false
  }
  if (isFood(r) && r.food.calories > 20) {
    const f = r.food
    out.atwater = Math.abs(4 * f.protein_g + 4 * f.carbs_g + 9 * f.fat_g - f.calories) / f.calories
  }
  return out
}

/** Summary of a set of scored records. */
export function summarise(rows) {
  const refRows = rows.filter((r) => r.s.hit !== null)
  const errs = refRows.filter((r) => r.s.kcalErr !== null)
  return {
    n: rows.length,
    failed: rows.filter((r) => r.s.failed).length,
    statusOk: mean(rows.map((r) => (r.s.statusOk ? 1 : 0))),
    hits: refRows.filter((r) => r.s.hit).length,
    refN: refRows.length,
    meanKcalErr: mean(errs.map((r) => r.s.kcalErr)),
    meanMacroErr: mean(errs.map((r) => r.s.macroErr)),
    searchRight: mean(rows.map((r) => (r.s.searchRight ? 1 : 0))),
    brandMissed: rows.filter((r) => r.s.brandMissed).length,
    searchWasted: rows.filter((r) => r.s.searchWasted).length,
    searched: mean(rows.map((r) => (r.s.searchStep ? 1 : 0))),
    queries: mean(rows.map((r) => r.s.queries)),
    cost: mean(rows.map((r) => r.s.cost)),
    msMed: median(rows.map((r) => r.s.ms)),
    msP90: pct(rows.map((r) => r.s.ms), 90),
    atwater: median(rows.filter((r) => r.s.atwater !== null).map((r) => r.s.atwater)),
    imperial: rows.filter((r) => r.s.imperial).length,
    spread: spread(rows),
  }
}

/** Median over foods of (max − min) / median kcal across rounds: 0 = same every time. */
function spread(rows) {
  const byFood = new Map()
  for (const r of rows) {
    if (r.s.kcal === null) continue
    if (!byFood.has(r.food.text)) byFood.set(r.food.text, [])
    byFood.get(r.food.text).push(r.s.kcal)
  }
  const sp = [...byFood.values()].filter((k) => k.length > 1).map((k) => (Math.max(...k) - Math.min(...k)) / (median(k) || 1))
  return median(sp)
}

// Seeded so a report re-made from the same raw file shows the same intervals.
function rng(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/**
 * Paired difference variant − baseline, averaged per food first (rounds of
 * one food are not independent), then a 95% bootstrap interval over foods.
 */
export function paired(rowsV, rowsB, metric, { foodsOnly } = {}) {
  const per = (rows) => {
    const m = new Map()
    for (const r of rows) {
      const v = metric(r)
      if (v === null || v === undefined || Number.isNaN(v)) continue
      if (foodsOnly && !foodsOnly(r.food)) continue
      if (!m.has(r.food.text)) m.set(r.food.text, [])
      m.get(r.food.text).push(v)
    }
    return new Map([...m].map(([k, v]) => [k, mean(v)]))
  }
  const a = per(rowsV)
  const b = per(rowsB)
  const diffs = [...a.keys()].filter((k) => b.has(k)).map((k) => a.get(k) - b.get(k))
  if (diffs.length < 3) return null
  const rand = rng(12345)
  const boots = []
  for (let i = 0; i < 2000; i++) {
    let s = 0
    for (let j = 0; j < diffs.length; j++) s += diffs[Math.floor(rand() * diffs.length)]
    boots.push(s / diffs.length)
  }
  return { diff: mean(diffs), lo: pct(boots, 2.5), hi: pct(boots, 97.5), n: diffs.length }
}

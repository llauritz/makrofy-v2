// The onboarding "Calculate my daily need" estimate (#35). Pure, so the
// numbers are pinned by tests. Nothing here is stored: only the Goal the user
// picks from it is (ADR 0003 keeps the Goal the one synced setting).
//
// Resting energy is Mifflin–St Jeor, the usual default for adults. "Other"
// takes the midpoint of the female and male constants. An activity factor
// turns resting energy into a day's need, and a weekly pace becomes a daily
// surplus or deficit at ~7,700 kcal per kg of body weight.

export type Sex = "female" | "male" | "other"
export type Activity = "low" | "moderate" | "high"
export type Aim = "lose" | "maintain" | "gain"

export interface Body {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  activity: Activity
}

const SEX_CONSTANT: Record<Sex, number> = {
  male: 5,
  female: -161,
  other: -78,
}

/** Mostly sitting · on your feet · very active. */
const ACTIVITY_FACTOR: Record<Activity, number> = {
  low: 1.2,
  moderate: 1.55,
  high: 1.725,
}

export const KCAL_PER_KG = 7700

/** Weekly paces offered per aim, in kg per week. */
export const PACES: Record<Exclude<Aim, "maintain">, readonly number[]> = {
  lose: [0.25, 0.5, 0.75],
  gain: [0.25, 0.5],
}

/** No suggested Goal goes below this, whatever the pace. */
export const MIN_SUGGESTED_KCAL = 1200

/** Ranges the form accepts; outside them the estimate isn't meaningful. */
export const LIMITS = {
  age: [14, 100],
  heightCm: [120, 230],
  weightKg: [30, 300],
} as const

/** Suggestions read as round figures, like a Goal someone would pick. */
export function roundTo50(kcal: number): number {
  return Math.round(kcal / 50) * 50
}

/** Energy to hold the current weight, unrounded. */
export function maintenanceKcal(body: Body): number {
  const resting =
    10 * body.weightKg +
    6.25 * body.heightCm -
    5 * body.age +
    SEX_CONSTANT[body.sex]
  return resting * ACTIVITY_FACTOR[body.activity]
}

export interface PaceOption {
  /** kg per week; 0 for maintain. */
  kgPerWeek: number
  /** The suggested Goal, rounded. */
  kcal: number
}

/**
 * The Goals to choose from for an aim: one for maintain, one per pace
 * otherwise. Losing never suggests below MIN_SUGGESTED_KCAL; paces that would
 * all land on that floor collapse into one, so no two options read the same.
 */
export function paceOptions(maintenance: number, aim: Aim): PaceOption[] {
  if (aim === "maintain")
    return [{ kgPerWeek: 0, kcal: roundTo50(maintenance) }]
  const sign = aim === "lose" ? -1 : 1
  const options: PaceOption[] = []
  for (const kg of PACES[aim]) {
    const daily = (kg * KCAL_PER_KG) / 7
    const kcal = Math.max(
      MIN_SUGGESTED_KCAL,
      roundTo50(maintenance + sign * daily)
    )
    if (options.some((o) => o.kcal === kcal)) continue
    options.push({ kgPerWeek: kg, kcal })
  }
  return options
}

/** Which option starts selected: the middle pace when there are three. */
export function defaultPaceIndex(options: readonly PaceOption[]): number {
  return options.length >= 3 ? 1 : 0
}

/** Parse a form number within [lo, hi]; null when blank or out of range. */
export function parseInRange(
  raw: string,
  [lo, hi]: readonly [number, number]
): number | null {
  const n = Number(raw.trim().replace(",", "."))
  if (raw.trim() === "" || !Number.isFinite(n)) return null
  return n >= lo && n <= hi ? n : null
}

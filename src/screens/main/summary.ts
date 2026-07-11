import type { Entry } from "@/data/entries"

// summarize reads only the nutrient fields, so both live Entries and lighter
// rows satisfy it.
type Nutrients = Pick<Entry, "kcal" | "protein" | "fat" | "carbs">

export interface DaySummary {
  /** Total kcal logged for the Day. */
  consumed: number
  goalKcal: number
  /** Goal − consumed, signed. The card shows this only when not over. */
  remaining: number
  /** How far past the Goal, 0 when within it. */
  over: number
  isOver: boolean
  /** Consumed as a rounded % of Goal; 0 (never NaN) when no Goal is set. */
  pctOfGoal: number
  /** Summed grams, decimals preserved. */
  totals: { protein: number; fat: number; carbs: number }
}

/** Reduce a Day's Entries against the Goal for the floating summary card. */
export function summarize(
  entries: readonly Nutrients[],
  goalKcal: number,
): DaySummary {
  const totals = { protein: 0, fat: 0, carbs: 0 }
  let consumed = 0
  for (const e of entries) {
    consumed += e.kcal
    totals.protein += e.protein ?? 0
    totals.fat += e.fat ?? 0
    totals.carbs += e.carbs ?? 0
  }

  const remaining = goalKcal - consumed
  return {
    consumed,
    goalKcal,
    remaining,
    over: Math.max(0, -remaining),
    isOver: consumed > goalKcal,
    pctOfGoal: goalKcal > 0 ? Math.round((consumed / goalKcal) * 100) : 0,
    totals,
  }
}

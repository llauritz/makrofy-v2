import { localDay, stepDay } from "@/lib/day"

// Weight from Health Connect, shaped for the stats dashboard (ADR 0014). Pure:
// the samples come from the device cache the stats screen reads first.

/** One weigh-in, as Health Connect reports it. */
export interface WeightSample {
  timeMs: number
  kg: number
}

export interface WeightSummary {
  /** The latest weigh-in. */
  latest: WeightSample
  /** Latest minus the first weigh-in inside the window; null with only one. */
  change: number | null
  /** One value per Day of the window, oldest first: that Day's last weigh-in. */
  daily: (number | null)[]
}

/**
 * Summarise the weigh-ins of the `days`-long window ending today. A Day with
 * several weigh-ins keeps its last one; a Day without any is a gap. Null when
 * the window holds no weigh-in at all.
 */
export function weightSummary(
  samples: readonly WeightSample[],
  today: string,
  days = 30
): WeightSummary | null {
  const start = stepDay(today, -(days - 1))
  const inWindow = samples
    .filter((s) => {
      const day = localDay(new Date(s.timeMs))
      return day >= start && day <= today
    })
    .sort((a, b) => a.timeMs - b.timeMs)
  if (inWindow.length === 0) return null

  const lastPerDay = new Map<string, number>()
  for (const s of inWindow) lastPerDay.set(localDay(new Date(s.timeMs)), s.kg)
  const daily = Array.from(
    { length: days },
    (_, i) => lastPerDay.get(stepDay(start, i)) ?? null
  )

  const latest = inWindow[inWindow.length - 1]
  const change = inWindow.length > 1 ? latest.kg - inWindow[0].kg : null
  return { latest, change, daily }
}

/** A weight for display: kilograms to one decimal. */
export function roundKg(kg: number): number {
  return Math.round(kg * 10) / 10
}

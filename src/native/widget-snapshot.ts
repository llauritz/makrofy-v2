// What the home screen widget paints (Android only, see src/native/widget.ts).
// The widget is native UI that can't run the app's code, so the app hands it a
// finished picture: today's numbers already summed, formatted and translated
// in the app's own language, plus the face an empty next Day will show. The
// widget never formats or translates anything itself, and never touches
// Firestore. Pure so the snapshot shape is pinned by tests
// (tests/widget-snapshot.test.ts).
import type { Entry } from "@/data/entries"
import type { Dictionary } from "@/lib/i18n"
import { localDay, stepDay } from "@/lib/day"
import { MACROS } from "@/screens/main/macros"
import { summarize } from "@/screens/main/summary"

type Nutrients = Pick<Entry, "kcal" | "protein" | "fat" | "carbs">

/** One Day's worth of summary card, ready to paint. */
export interface WidgetFace {
  /** Ring fill, 0–1 (capped at full once over the Goal, like the card). */
  fraction: number
  /** The ring's centre figure — kcal eaten, formatted ("1,240"). */
  consumed: string
  /** "Remaining: 760" / "Over: 120" — the card's headline. */
  headline: string
  /** "62% of 2,000 goal" — the card's second line. */
  detail: string
  /** P/F/C grams in the card's order, unit included ("80g"). */
  macros: { letter: string; grams: string }[]
  /** The whole face as one sentence, for screen readers. */
  description: string
}

/**
 * The widget's whole input. `day` is the Day `today` belongs to; once the
 * device clock passes it, the widget shows `empty` instead (a new Day starts
 * at zero against the same Goal) until the app writes a fresh snapshot.
 */
export interface WidgetSnapshot {
  /** Bumped on a breaking shape change; the widget ignores versions it doesn't know. */
  version: 1
  day: string
  today: WidgetFace
  empty: WidgetFace
  /** The unit under the ring's figure. */
  kcalUnit: string
  /** Accessible name of the "+" button. */
  addLabel: string
}

export const WIDGET_SNAPSHOT_VERSION = 1

/** Build the face one Day's Entries show against the Goal. */
export function widgetFace(
  entries: readonly Nutrients[],
  goalKcal: number,
  t: Dictionary,
  n: (value: number) => string,
): WidgetFace {
  const s = summarize(entries, goalKcal)
  const headline = s.isOver
    ? t.summary.over(n(s.over))
    : t.summary.remaining(n(s.remaining))
  const consumed = n(s.consumed)
  const detail = t.summary.pctOfGoal(n(s.pctOfGoal), n(s.goalKcal))
  const macros = MACROS.map((m) => ({
    letter: m.letter,
    grams: `${n(Math.round(s.totals[m.field]))}${t.units.g}`,
  }))
  const macroWords = MACROS.map(
    (m, i) => `${t.macros[m.field]} ${macros[i].grams}`,
  ).join(", ")
  return {
    fraction: s.goalKcal > 0 ? Math.min(1, s.consumed / s.goalKcal) : 0,
    consumed,
    headline,
    detail,
    macros,
    description: t.widget.description(
      consumed,
      n(s.goalKcal),
      headline,
      macroWords,
    ),
  }
}

/** The snapshot for `day`'s Entries; `empty` is the same Goal at zero. */
export function buildWidgetSnapshot({
  day,
  entries,
  goalKcal,
  t,
  n,
}: {
  day: string
  entries: readonly Nutrients[]
  goalKcal: number
  t: Dictionary
  n: (value: number) => string
}): WidgetSnapshot {
  return {
    version: WIDGET_SNAPSHOT_VERSION,
    day,
    today: widgetFace(entries, goalKcal, t, n),
    empty: widgetFace([], goalKcal, t, n),
    kcalUnit: t.units.kcal,
    addLabel: t.widget.add,
  }
}

/** Milliseconds from `now` until the next local midnight (DST-exact). */
export function msUntilNextDay(now: Date = new Date()): number {
  const [y, m, d] = stepDay(localDay(now), 1).split("-").map(Number)
  return new Date(y, m - 1, d).getTime() - now.getTime()
}

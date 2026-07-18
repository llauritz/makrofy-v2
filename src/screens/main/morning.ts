import type { StatDay } from "@/lib/stats"

// The morning glance strip's gates (issue #22): pure day/state logic, kept out
// of the component like the sibling coverage.ts gate (#42). The strip shows on
// the first open each morning and leaves by ✕ or the day's first logged Entry;
// while the most recent closed Day's Coverage ≠ Everything it also hosts the
// label/revise chips (the morning nudge from #42, merged into this strip).

/**
 * Whether the strip belongs above the summary card right now. "First open
 * each morning" falls out of the two dismissals: today has no Entries yet
 * (the first log auto-dismisses) and ✕ hasn't been tapped today
 * (`dismissedDay` is the device-local Day the ✕ was last tapped). Never shown
 * without at least one closed tracked Day in the window — a fresh profile has
 * nothing to glance at.
 */
export function showMorningStrip(
  days: readonly StatDay[],
  todayEntryCount: number,
  dismissedDay: string | null,
  today: string,
): boolean {
  if (todayEntryCount > 0 || dismissedDay === today) return false
  return days.some((d) => !d.isToday && !d.isFuture && d.kcal !== null)
}

/**
 * The Day the strip's Coverage chips ask about: the most recent closed Day
 * holding Entries, while its Coverage ≠ Everything (unlabelled, *Some* or
 * *Most* — a label to give or revise). Null once that Day is settled — the
 * nudge never reaches past it to older Days. The look-back is bounded by the
 * window the strip already builds; a gap longer than that means there is
 * nothing recent enough to be worth a morning question.
 */
export function morningNudgeDay(days: readonly StatDay[]): string | null {
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]
    if (d.isToday || d.isFuture || d.kcal === null) continue
    return d.coverage === "everything" ? null : d.day
  }
  return null
}

// Persistence for the ✕: the Day it was last tapped, device-local like the
// theme and language choices. Storage can be absent or fenced off (private
// mode) — reads fall back to "never dismissed", writes fail silently, and the
// strip then simply reappears, which is the harmless direction to fail.
const DISMISS_KEY = "yaffle:morning-strip:v1"

export function readDismissedDay(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY)
  } catch {
    return null
  }
}

export function writeDismissedDay(day: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, day)
  } catch {
    // Nothing to do — the strip will show again tomorrow-and-today alike.
  }
}

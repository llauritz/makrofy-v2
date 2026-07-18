import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import type { Entry } from "@/data/entries"
import { useCoverageRange, useIdentity } from "@/data/hooks"
import { localDay } from "@/lib/day"
import { useI18n } from "@/lib/i18n/useI18n"
import {
  averageKcal,
  deltaPct,
  earliestDay,
  inRangeWeek,
  maxWeekOffset,
  rangeBounds,
  statDays,
  weekRangeLabel,
  weekWindow,
} from "@/lib/stats"
import { useDaySwipe } from "@/lib/useDaySwipe"
import { FadeSwap } from "@/screens/main/FadeSwap"
import { RangeDots, WeekColumns } from "./charts"
import { ScreenChrome } from "./StatsScreen"

// The week report subpage (issue #22): one 7-day window at a time, paged by
// the wide pill selector (borderless chevrons + a label reading "This week"
// or the window's dates) and by swipe — the same gesture that steps Days on
// the main screen, here stepping weeks. Windows are trailing 7-day slices
// ending today, so "this week" always ends now rather than on a calendar
// boundary; paging bottoms out at the window holding the earliest Entry.
export function WeekReport({
  entries,
  goalKcal,
  onBack,
}: {
  entries: Entry[]
  goalKcal: number
  onBack: () => void
}) {
  const { t, n, language } = useI18n()
  const uid = useIdentity()
  const today = localDay(new Date())
  const [offset, setOffset] = React.useState(0)
  const maxOffset = maxWeekOffset(earliestDay(entries), today)

  const window = weekWindow(offset, today)
  const prevWindow = weekWindow(offset + 1, today)
  const coverage = useCoverageRange(uid, prevWindow.start, window.end)
  // Both windows in one build: the current week plus the one before it for
  // the delta line.
  const days = React.useMemo(
    () => statDays(entries, coverage, prevWindow.start, window.end, today),
    [entries, coverage, prevWindow.start, window.end, today],
  )
  const week = days.slice(7)
  const avg = averageKcal(week)
  const delta = deltaPct(avg, averageKcal(days.slice(0, 7)))
  const range = inRangeWeek(week, goalKcal)
  const bounds = rangeBounds(goalKcal)

  const older = () => setOffset((o) => Math.min(maxOffset, o + 1))
  const newer = () => setOffset((o) => Math.max(0, o - 1))
  // Content follows the finger: dragging right (delta −1) reveals the older
  // week, mirroring the Day swipe's direction on the main screen.
  const swipe = useDaySwipe((delta) => (delta < 0 ? older() : newer()))

  return (
    <ScreenChrome title={t.stats.weekReport} onBack={onBack}>
      <div className="mb-4 flex items-center justify-between rounded-full border bg-card px-1 py-1">
        <button
          type="button"
          aria-label={t.stats.olderWeek}
          onClick={older}
          disabled={offset >= maxOffset}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[13px] font-semibold" aria-live="polite">
          {offset === 0
            ? t.stats.thisWeek
            : weekRangeLabel(window.start, window.end, language)}
        </span>
        <button
          type="button"
          aria-label={t.stats.newerWeek}
          onClick={newer}
          disabled={offset === 0}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div {...swipe} className="touch-pan-y px-1">
        <FadeSwap swapKey={String(offset)}>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-[44px] leading-none font-semibold">
                {avg === null ? "—" : n(avg)}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {t.stats.kcalPerDay}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {t.stats.sevenDayAverage}
              {delta !== null && (
                <>
                  {" · "}
                  {delta >= 0
                    ? t.stats.upOnWeekBefore(n(Math.abs(delta)))
                    : t.stats.downOnWeekBefore(n(Math.abs(delta)))}
                </>
              )}
            </p>

            <div className="mt-6">
              <WeekColumns
                days={week}
                goalKcal={goalKcal}
                caption={t.stats.weekReport}
                height={140}
              />
            </div>

            {range.enough ? (
              <div className="mt-6 flex items-center justify-between gap-3 rounded-3xl border bg-card px-4 py-3.5">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold">
                    {t.stats.daysInRange(n(range.inRange), n(range.assessable))}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {t.stats.rangeBand(n(bounds.lo), n(bounds.hi))}
                  </div>
                </div>
                <RangeDots dots={range.dots} />
              </div>
            ) : (
              <div className="mt-6 rounded-3xl border border-dashed border-[#cbbfa4] px-4 py-3.5 dark:border-[#4a3e2e]">
                <div className="text-[13px] font-semibold text-muted-foreground">
                  {t.stats.inRange}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {t.stats.rangeGateBody(n(range.assessable))}
                </div>
              </div>
            )}

            <p className="mt-4 text-[11px] text-muted-foreground">
              {t.stats.untrackedNote}
            </p>
          </div>
        </FadeSwap>
      </div>
    </ScreenChrome>
  )
}

import * as React from "react"
import { X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { clearCoverage, setCoverage, type CoverageLevel } from "@/data/days"
import { useAllEntries, useCoverageRange } from "@/data/hooks"
import { localDay, relativeDayLabel, stepDay } from "@/lib/day"
import { db } from "@/lib/firebase"
import { useI18n } from "@/lib/i18n/useI18n"
import {
  averageKcal,
  deltaPct,
  inRangeWeek,
  statDays,
} from "@/lib/stats"
import { WeekColumns } from "@/screens/stats/charts"
import { SPRING } from "./anim"
import { COVERAGE_LEVELS } from "./coverage"
import {
  morningNudgeDay,
  readDismissedDay,
  showMorningStrip,
  writeDismissedDay,
} from "./morning"

// The strip glances back one week plus the week before it (the delta), and the
// nudge looks for the last closed Day inside the same window.
const STRIP_DAYS = 14

// The morning glance strip (issue #22): last-7-days columns, the 7-day average
// with its delta, and the in-range count when the band has earned its place —
// above the summary card on the first open each morning. It leaves by ✕ or on
// the day's first logged Entry (both gates in morning.ts). While the most
// recent closed Day's Coverage ≠ Everything it also carries the Some/Most/
// Everything chips — the morning nudge from #42, merged here instead of being
// a second card.
export function MorningStrip({
  uid,
  goalKcal,
}: {
  uid: string | null
  goalKcal: number
}) {
  const { t, n, language } = useI18n()
  const today = localDay(new Date())
  const start = stepDay(today, -(STRIP_DAYS - 1))
  const entries = useAllEntries(uid)
  const coverage = useCoverageRange(uid, start, today)
  const [dismissedDay, setDismissedDay] = React.useState(readDismissedDay)

  const days = React.useMemo(
    () => statDays(entries, coverage, start, today, today),
    [entries, coverage, start, today],
  )
  const todayCount = entries.filter((e) => e.date === today).length
  const visible = showMorningStrip(days, todayCount, dismissedDay, today)

  const week = days.slice(-7)
  const avg7 = averageKcal(week)
  const delta = deltaPct(avg7, averageKcal(days.slice(0, 7)))
  const range = inRangeWeek(week, goalKcal)

  const nudgeDay = morningNudgeDay(days)
  const nudgeLevel = nudgeDay === null ? null : (coverage.get(nudgeDay) ?? null)
  // A chip tap mirrors the Coverage control (#42): re-tapping the stored
  // label clears it, any other level replaces it.
  const labelNudgeDay = (level: CoverageLevel) => {
    if (!uid || nudgeDay === null) return
    if (level === nudgeLevel) clearCoverage(db, uid, nudgeDay)
    else setCoverage(db, uid, nudgeDay, level)
  }

  const dismiss = () => {
    writeDismissedDay(today)
    setDismissedDay(today)
  }

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="morning-strip"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={SPRING}
          className="mb-2 rounded-3xl border bg-card px-4 py-3 shadow-[0_8px_30px_rgba(43,32,21,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {t.stats.last7Days}
            </span>
            <div className="flex items-center gap-2">
              {range.enough && (
                <span className="text-[11px] text-muted-foreground">
                  {t.stats.inRangeShort(n(range.inRange), n(range.assessable))}
                </span>
              )}
              <button
                type="button"
                aria-label={t.stats.dismissStrip}
                onClick={dismiss}
                className="-mr-1 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4">
            <WeekColumns
              days={week}
              goalKcal={goalKcal}
              caption={t.stats.last7Days}
              height={54}
              mini
            />
            <div className="flex shrink-0 flex-col items-end">
              <div className="flex items-baseline gap-1">
                <span className="text-[20px] leading-none font-semibold">
                  {avg7 === null ? "—" : n(avg7)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {t.stats.kcalAvg}
                </span>
              </div>
              {delta !== null && (
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {delta >= 0
                    ? t.stats.stripDeltaUp(n(Math.abs(delta)))
                    : t.stats.stripDeltaDown(n(Math.abs(delta)))}
                </span>
              )}
            </div>
          </div>
          {nudgeDay !== null && (
            <div className="mt-2.5 border-t pt-2.5">
              <div className="text-[11px] text-muted-foreground/70">
                {t.stats.nudgeQuestion(
                  relativeDayLabel(nudgeDay, t.day, language),
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {COVERAGE_LEVELS.map((chip) => (
                  <motion.button
                    key={chip}
                    type="button"
                    aria-pressed={nudgeLevel === chip}
                    onClick={() => labelNudgeDay(chip)}
                    whileTap={{ scale: 0.95 }}
                    className={
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 " +
                      (nudgeLevel === chip
                        ? "border-foreground"
                        : "text-muted-foreground")
                    }
                  >
                    {t.coverage[chip]}
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

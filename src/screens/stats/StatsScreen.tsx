import * as React from "react"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { motion } from "motion/react"

import type { Entry } from "@/data/entries"
import { DEFAULT_GOAL_KCAL } from "@/data/goal"
import { useAllEntries, useCoverageRange, useGoal, useIdentity } from "@/data/hooks"
import { localDay, stepDay } from "@/lib/day"
import { useI18n } from "@/lib/i18n/useI18n"
import {
  averageKcal,
  deltaPct,
  inRangeWeek,
  rangeBounds,
  rolling7,
  statDays,
  weekMacroShare,
} from "@/lib/stats"
import { FADE_IN } from "@/screens/main/anim"
import { MACROS } from "@/screens/main/macros"
import {
  MacroStackWeek,
  Sparkline,
  StatTile,
  TAN,
  TrendLine,
  WeekColumns,
} from "./charts"
import { WeekReport } from "./WeekReport"

// The trend chart's window, plus the lead-in its rolling average needs so the
// ink line enters the frame already averaged over a full 7 days.
const TREND_DAYS = 30
const TREND_LEAD = 6

// The statistics dashboard (issue #22): the destination behind the summary
// card's stats button. Tiles over the Coverage-gated stats core; the This-week
// tile opens the week report subpage, which returns here. The two full screens
// swap by a plain conditional with a fade, the same mechanism App.tsx uses.
export function StatsScreen({
  onBack,
  onOpenGlossary,
}: {
  onBack: () => void
  onOpenGlossary: () => void
}) {
  const [report, setReport] = React.useState(false)
  const uid = useIdentity()
  const entries = useAllEntries(uid)
  const goal = useGoal(uid)
  const goalKcal = goal?.kcal ?? DEFAULT_GOAL_KCAL

  return report ? (
    <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={FADE_IN}>
      <WeekReport entries={entries} goalKcal={goalKcal} onBack={() => setReport(false)} />
    </motion.div>
  ) : (
    <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={FADE_IN}>
      <Dashboard
        entries={entries}
        goalKcal={goalKcal}
        onBack={onBack}
        onOpenWeek={() => setReport(true)}
        onOpenGlossary={onOpenGlossary}
      />
    </motion.div>
  )
}

function Dashboard({
  entries,
  goalKcal,
  onBack,
  onOpenWeek,
  onOpenGlossary,
}: {
  entries: Entry[]
  goalKcal: number
  onBack: () => void
  onOpenWeek: () => void
  onOpenGlossary: () => void
}) {
  const { t, n } = useI18n()
  const uid = useIdentity()
  const today = localDay(new Date())
  const start = stepDay(today, -(TREND_DAYS + TREND_LEAD - 1))
  const coverage = useCoverageRange(uid, start, today)

  const days = React.useMemo(
    () => statDays(entries, coverage, start, today, today),
    [entries, coverage, start, today],
  )
  const week = days.slice(-7)
  const avg7 = averageKcal(week)
  const delta = deltaPct(avg7, averageKcal(days.slice(-14, -7)))
  const range = inRangeWeek(week, goalKcal)
  const bounds = rangeBounds(goalKcal)
  const rolling = React.useMemo(() => rolling7(days), [days])
  const share = weekMacroShare(week)
  const macroName = { p: t.macros.protein, f: t.macros.fat, c: t.macros.carbs } as const

  return (
    <ScreenChrome title={t.stats.title} onBack={onBack}>
      <div className="flex flex-col gap-3">
        <Section
          title={t.stats.thisWeek}
          sub={t.stats.thisWeekSub}
          onOpen={onOpenWeek}
        >
          <WeekColumns days={week} goalKcal={goalKcal} caption={t.stats.thisWeek} />
        </Section>

        <div className="flex gap-3">
          <StatTile
            label={t.stats.sevenDayAverage}
            value={avg7 === null ? "—" : n(avg7)}
            unit={t.units.kcal}
            note={
              delta === null
                ? t.stats.trackedDaysOnly
                : `${t.stats.vsWeekBefore((delta > 0 ? "+" : "") + n(delta))} · ${t.stats.trackedDaysOnly}`
            }
            spark={<Sparkline values={rolling.slice(-12)} />}
          />
          {range.enough ? (
            <StatTile
              label={t.stats.inRange}
              value={t.stats.ofCount(n(range.inRange), n(range.assessable))}
              unit={t.stats.daysUnit}
              note={t.stats.rangeBand(n(bounds.lo), n(bounds.hi))}
            />
          ) : (
            <StatTile
              label={t.stats.inRange}
              value="—"
              note={t.stats.rangeGateNote}
              dashed
            />
          )}
        </div>

        <Section title={t.stats.trend} sub={t.stats.last30Days}>
          <TrendLine
            days={days.slice(-TREND_DAYS)}
            avg={rolling.slice(-TREND_DAYS)}
            goalKcal={goalKcal}
            caption={`${t.stats.trend} · ${t.stats.last30Days}`}
          />
          <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-4 rounded-full"
                style={{ backgroundColor: TAN }}
              />
              {t.stats.legendDaily}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-foreground" />
              {t.stats.legendAverage}
            </span>
          </div>
        </Section>

        <Section title={t.stats.macros} sub={t.stats.macrosSub}>
          <MacroStackWeek days={week} caption={t.stats.macros} />
          <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            {MACROS.map((m) => (
              <span key={m.key} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: m.mark }}
                />
                {macroName[m.key]}
                {share !== null && (
                  <span className="tabular-nums">
                    {n(Math.round(share[m.key] * 100))}%
                  </span>
                )}
              </span>
            ))}
          </div>
        </Section>

        {/* The Glossary's second doorway (issue #40's note): the dashboard is
            where the derived numbers meet the foods behind them. */}
        <button
          type="button"
          onClick={onOpenGlossary}
          className="flex items-center justify-between rounded-3xl border bg-card p-4 text-left"
        >
          <span className="text-[13px] font-semibold">{t.settings.foodGlossary}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </ScreenChrome>
  )
}

/** The stats screens' shared chrome: back button, title, a max-w-md column. */
export function ScreenChrome({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col px-4 pb-8">
      <header className="flex items-center gap-1 pt-7 pb-4">
        <button
          type="button"
          onClick={onBack}
          aria-label={t.common.back}
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[22px] font-semibold">{title}</h1>
      </header>
      {children}
    </div>
  )
}

/** A dashboard card: a titled section, optionally tappable (the This-week tile). */
function Section({
  title,
  sub,
  onOpen,
  children,
}: {
  title: string
  sub?: string
  onOpen?: () => void
  children: React.ReactNode
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold">{title}</h2>
          {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        {onOpen && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="mt-3">{children}</div>
    </>
  )
  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-3xl border bg-card p-4 text-left"
    >
      {body}
    </button>
  ) : (
    <section className="rounded-3xl border bg-card p-4">{body}</section>
  )
}

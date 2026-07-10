// PROTOTYPE — issue #7, Variant A "Dashboard".
// Philosophy: stats are a destination. The summary-card stats button opens a
// dedicated screen carrying the FULL candidate set — week columns, avg +
// in-range tiles, 30-day trend, macro share, goal Δ, monthly calendar — so the
// reaction tells us which modules die. The main screen is untouched.
// Opens the screen on mount so flipping variants lands on the thing being judged.
import * as React from "react"
import { ChevronLeft } from "lucide-react"

import { Shell, MACROS } from "./Shell"
import {
  GoalDelta,
  MacroStackWeek,
  MonthHeat,
  MUTED,
  INK,
  TAN,
  Sparkline,
  StatTile,
  TrendLine,
  WeekColumns,
} from "./charts"
import {
  DAYS,
  RANGE_HI,
  RANGE_LO,
  avgKcal,
  inRangeStats,
  lastDays,
  rolling7,
} from "./data"

function Section({
  title,
  sub,
  children,
}: {
  title: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-3xl border border-[#eee5d2] bg-[#fffdf7] p-4 dark:border-[#3a2f22] dark:bg-[#2a211a]">
      <h2 className="text-[13px] font-semibold">{title}</h2>
      {sub && (
        <p className="mt-0.5 text-[11px]" style={{ color: MUTED }}>
          {sub}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function StatsScreen({ onBack }: { onBack: () => void }) {
  const week = lastDays(7)
  const avg7 = avgKcal(week)
  const avgPrev = avgKcal(DAYS.slice(-14, -7))
  const deltaPct =
    avg7 != null && avgPrev != null
      ? Math.round(((avg7 - avgPrev) / avgPrev) * 100)
      : null
  const range = inRangeStats()
  const trend = rolling7(30)
  const trendDates = lastDays(30).map((d) => d.date)
  const dailyVals = lastDays(30).map((d) => (d.today ? null : d.kcal))
  const weekShare = week
    .filter((d) => d.kcal != null && !d.today)
    .reduce(
      (acc, d) => {
        const kc = { p: d.p * 4, f: d.f * 9, c: d.c * 4 }
        const t = kc.p + kc.f + kc.c || 1
        return { p: acc.p + kc.p / t, f: acc.f + kc.f / t, c: acc.c + kc.c / t, n: acc.n + 1 }
      },
      { p: 0, f: 0, c: 0, n: 0 }
    )

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#f6f1e6] text-[#2b2015] dark:bg-[#17110c] dark:text-[#f3ece2]">
      <div className="mx-auto max-w-md px-4 pb-8">
        <header className="flex items-center gap-2 pt-7 pb-4">
          <button
            aria-label="Back"
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e6dcc8] bg-[#fffdf7] text-[#7d7060] dark:border-[#3a2f22] dark:bg-[#2a211a] dark:text-[#a5988a]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-semibold">Statistics</h1>
        </header>

        <div className="flex flex-col gap-3">
          <Section title="This week" sub="Daily calories · dashed slots are untracked days">
            <WeekColumns days={lastDays(7)} />
          </Section>

          <div className="flex gap-3">
            <StatTile
              label="7-day average"
              value={avg7 == null ? "—" : avg7.toLocaleString()}
              unit="kcal"
              note={
                deltaPct == null
                  ? "tracked days only"
                  : `${deltaPct > 0 ? "+" : "−"}${Math.abs(deltaPct)}% vs week before · tracked days only`
              }
              spark={<Sparkline values={rolling7(12).map((p) => p.avg)} />}
            />
            <StatTile
              label="In range"
              value={`${range.inRange} of ${range.tracked}`}
              unit="days"
              note={`${RANGE_LO.toLocaleString()}–${RANGE_HI.toLocaleString()} kcal (80–110% of goal)`}
            />
          </div>

          <Section title="Trend" sub="Last 30 days">
            <TrendLine daily={dailyVals} avg={trend.map((p) => p.avg)} dates={trendDates} />
            <div className="mt-2 flex items-center gap-4 text-[10px]" style={{ color: MUTED }}>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: TAN }} />
                daily
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: INK }} />
                7-day average
              </span>
            </div>
          </Section>

          <Section title="Macros" sub="Share of calories per day">
            <MacroStackWeek days={lastDays(7)} />
            <div className="mt-2 flex items-center gap-4 text-[10px]" style={{ color: MUTED }}>
              {MACROS.map((m) => (
                <span key={m.key} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                  {m.label}
                  {weekShare.n > 0 && (
                    <span className="tabular-nums">
                      {Math.round((weekShare[m.key] / weekShare.n) * 100)}%
                    </span>
                  )}
                </span>
              ))}
            </div>
          </Section>

          <Section title="Goal difference" sub="Last 14 days · above the line = over goal">
            <GoalDelta days={lastDays(14)} />
          </Section>

          <Section title="July" sub="Darker = more calories · future days fill in as they arrive">
            <MonthHeat days={DAYS} />
          </Section>
        </div>
      </div>
    </div>
  )
}

export function VariantDashboard() {
  const [open, setOpen] = React.useState(true)
  return (
    <>
      <Shell onStats={() => setOpen(true)} />
      {open && <StatsScreen onBack={() => setOpen(false)} />}
    </>
  )
}

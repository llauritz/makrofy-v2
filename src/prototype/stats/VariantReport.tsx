// PROTOTYPE — issue #7, Variant C "Week report".
// Philosophy: both, curated. A one-line teaser above the summary card leads to a
// focused, narrative screen: a big 7-day average up top, the week's columns, the
// in-range row, and the 30-day trend (average line only). No macro chart, no
// monthly calendar — if their absence stings, that reaction is the data point.
// Opens the screen on mount so flipping variants lands on the thing being judged.
import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import {
  MUTED,
  RangeDots,
  TrendLine,
  WeekColumns,
} from "./charts"
import { Shell } from "./Shell"
import {
  DAYS,
  RANGE_HI,
  RANGE_LO,
  avgKcal,
  inRangeStats,
  lastDays,
  rolling7,
} from "./data"

function Teaser({ onOpen }: { onOpen: () => void }) {
  const avg7 = avgKcal(lastDays(7))
  const range = inRangeStats()
  return (
    <button
      onClick={onOpen}
      className="mx-1 mb-2 flex items-center justify-between rounded-full border border-[#eee5d2] bg-[#fffdf7] py-2 pr-2 pl-4 text-left shadow-[0_8px_30px_rgba(43,32,21,0.12)] dark:border-[#3a2f22] dark:bg-[#2a211a] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
    >
      <span className="text-[12px]" style={{ color: MUTED }}>
        This week{" "}
        <span className="font-semibold text-[#2b2015] tabular-nums dark:text-[#f3ece2]">
          {avg7 == null ? "—" : avg7.toLocaleString()} kcal
        </span>{" "}
        avg · {range.inRange} of {range.tracked} in range
      </span>
      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: MUTED }} />
    </button>
  )
}

function ReportScreen({ onBack }: { onBack: () => void }) {
  const week = lastDays(7)
  const avg7 = avgKcal(week)
  const avgPrev = avgKcal(DAYS.slice(-14, -7))
  const deltaPct =
    avg7 != null && avgPrev != null
      ? Math.round(((avg7 - avgPrev) / avgPrev) * 100)
      : null
  const range = inRangeStats()
  const trend = rolling7(30)

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#f6f1e6] text-[#2b2015] dark:bg-[#17110c] dark:text-[#f3ece2]">
      <div className="mx-auto max-w-md px-5 pb-8">
        <header className="flex items-center gap-2 pt-7 pb-2 -ml-1">
          <button
            aria-label="Back"
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e6dcc8] bg-[#fffdf7] text-[#7d7060] dark:border-[#3a2f22] dark:bg-[#2a211a] dark:text-[#a5988a]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-semibold">This week</h1>
        </header>

        {/* hero: the one number the report leads with */}
        <div className="mt-4">
          <div className="flex items-baseline gap-2">
            <span className="text-[44px] leading-none font-semibold">
              {avg7 == null ? "—" : avg7.toLocaleString()}
            </span>
            <span className="text-[13px]" style={{ color: MUTED }}>
              kcal / day
            </span>
          </div>
          <p className="mt-1.5 text-[13px]" style={{ color: MUTED }}>
            7-day average
            {deltaPct != null && (
              <>
                {" · "}
                {deltaPct > 0 ? "up" : "down"} {Math.abs(deltaPct)}% on the week
                before
              </>
            )}
          </p>
        </div>

        <div className="mt-6">
          <WeekColumns days={week} height={140} />
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 rounded-3xl border border-[#eee5d2] bg-[#fffdf7] px-4 py-3.5 dark:border-[#3a2f22] dark:bg-[#2a211a]">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">
              {range.inRange} of {range.tracked} days in range
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: MUTED }}>
              {RANGE_LO.toLocaleString()}–{RANGE_HI.toLocaleString()} kcal (80–110% of goal)
            </div>
          </div>
          <RangeDots days={range.days} />
        </div>

        <div className="mt-7">
          <h2 className="text-[13px] font-semibold">Last 30 days</h2>
          <p className="mt-0.5 text-[11px]" style={{ color: MUTED }}>
            7-day average · untracked days are left out
          </p>
          <div className="mt-3">
            <TrendLine avg={trend.map((p) => p.avg)} dates={lastDays(30).map((d) => d.date)} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function VariantReport() {
  const [open, setOpen] = React.useState(true)
  return (
    <>
      <Shell onStats={() => setOpen(true)} aboveSummary={<Teaser onOpen={() => setOpen(true)} />} />
      {open && <ReportScreen onBack={() => setOpen(false)} />}
    </>
  )
}

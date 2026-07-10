// PROTOTYPE — issue #7, Variant B "Glance strip".
// Philosophy: stats are a glance, not a destination. There is NO stats screen —
// the summary card's stats button is gone, and one compact strip lives on the
// main screen above the summary: mini week columns, the 7-day average, and the
// in-range dots. If this feels insufficient, that reaction is the data point.
import { MUTED, WeekColumns } from "./charts"
import { Shell } from "./Shell"
import { DAYS, avgKcal, inRangeStats, lastDays } from "./data"

function GlanceStrip() {
  const week = lastDays(7)
  const avg7 = avgKcal(week)
  const avgPrev = avgKcal(DAYS.slice(-14, -7))
  const deltaPct =
    avg7 != null && avgPrev != null
      ? Math.round(((avg7 - avgPrev) / avgPrev) * 100)
      : null
  const range = inRangeStats()
  return (
    <div className="mx-1 mb-2 rounded-3xl border border-[#eee5d2] bg-[#fffdf7] px-4 py-3 shadow-[0_8px_30px_rgba(43,32,21,0.12)] dark:border-[#3a2f22] dark:bg-[#2a211a] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: MUTED }}>
          Last 7 days
        </span>
        <span className="text-[11px]" style={{ color: MUTED }}>
          {range.inRange} of {range.tracked} in range
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-4">
        <WeekColumns days={week} width={170} height={54} mini />
        <div className="flex shrink-0 flex-col items-end">
          <div className="flex items-baseline gap-1">
            <span className="text-[20px] leading-none font-semibold">
              {avg7 == null ? "—" : avg7.toLocaleString()}
            </span>
            <span className="text-[10px]" style={{ color: MUTED }}>
              kcal avg
            </span>
          </div>
          {deltaPct != null && (
            <span className="mt-0.5 text-[10px]" style={{ color: MUTED }}>
              {deltaPct > 0 ? "↑" : "↓"} {Math.abs(deltaPct)}% vs week before
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function VariantStrip() {
  return <Shell statsButton={false} aboveSummary={<GlanceStrip />} />
}

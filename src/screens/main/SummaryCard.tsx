import { BarChart3 } from "lucide-react"
import { motion } from "motion/react"

import { useI18n } from "@/lib/i18n/useI18n"
import { MACROS, macroTint } from "./macros"
import type { DaySummary } from "./summary"

// Single-hue ink meter — consumed kcal in the center. Hero number, so
// proportional figures (tabular-nums is for lists/columns only). The arc caps
// at full once over the Goal; the "Over" copy carries the overage.
function ProgressRing({ summary }: { summary: DaySummary }) {
  const { t, n } = useI18n()
  const size = 116
  const c = size / 2
  const r = 46
  const fraction =
    summary.goalKcal > 0 ? Math.min(1, summary.consumed / summary.goalKcal) : 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="light-dark(#efe6d4, #3a2f22)"
          strokeWidth={11}
        />
        {/* Start the meter at 12 o'clock. */}
        <g transform={`rotate(-90 ${c} ${c})`}>
          <motion.circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth={11}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: fraction }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xl leading-none font-bold">
          {n(summary.consumed)}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {t.units.kcal}
        </div>
      </div>
    </div>
  )
}

// Floating summary card: ring, Remaining/Over + % of goal, outlined macro
// pills, stats button (opens the dashboard once #22 lands). The ring and the
// Remaining/Over readout open Settings (where the goal they measure against is
// edited); the stats button and macro pills keep their own roles. The sticky
// footer and undo snackbar around it are the MainScreen's.
export function SummaryCard({
  summary,
  onOpenSettings,
}: {
  summary: DaySummary
  onOpenSettings: () => void
}) {
  const { t, n } = useI18n()
  const headline = summary.isOver
    ? t.summary.over(n(summary.over))
    : t.summary.remaining(n(summary.remaining))
  return (
    <div className="flex items-center gap-4 rounded-[28px] border bg-card p-4 shadow-[0_8px_30px_rgba(43,32,21,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label={t.summary.openSettings}
        className="shrink-0 rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
      >
        <ProgressRing summary={summary} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={t.summary.openSettings}
            className="rounded-md text-left outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring active:opacity-70"
          >
            <div className="text-lg leading-tight font-bold">{headline}</div>
            <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {t.summary.pctOfGoal(n(summary.pctOfGoal), n(summary.goalKcal))}
            </div>
          </button>
          <button
            type="button"
            aria-label={t.summary.statistics}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-input text-muted-foreground"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t pt-2.5">
          {MACROS.map((m) => (
            <span
              key={m.key}
              className="rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap tabular-nums"
              style={{
                borderColor: m.mark,
                backgroundColor: macroTint(m.mark, 8),
                color: m.text,
              }}
            >
              {m.letter} {n(Math.round(summary.totals[m.field]))}
              {t.units.g}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

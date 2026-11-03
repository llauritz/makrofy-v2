import { BarChart3 } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { Squircle } from "@/components/ui/squircle"
import { useI18n } from "@/lib/i18n/useI18n"
import { useAiCycleState } from "@/screens/paywall/Paywall"
import { statsAvailable } from "@/screens/stats/access"
import { SPRING } from "./anim"
import { MACROS } from "./macros"
import { MacroLetter } from "./MacroLetter"
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
      {/* The box is centred to the pixel, but the bold number carries nearly
          all the ink, so the pair reads high. Dropping it 3px splits the
          difference between the box centre and the ink's centre of mass. */}
      <div className="absolute inset-0 flex translate-y-[3px] flex-col items-center justify-center">
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

// Floating summary card: ring, Remaining/Over + % of goal, the day's macro
// totals, stats button (opens the dashboard, #22). The totals share one
// neutral capsule — letter + grams per macro, hairline dividers between — so
// they read as a single day figure, apart from the food rows' tinted per-item
// chips. The ring and the Remaining/Over readout open Settings (where the goal
// they measure against is edited); the stats button and macro totals keep
// their own roles. The sticky footer and undo snackbar around it are the
// MainScreen's. The stats button is for Pro and Unlimited only for now
// (src/screens/stats/access.ts); it is absent while the plan loads, and if a
// subscriber's plan arrives after the first frame the button scales in.
export function SummaryCard({
  summary,
  onOpenSettings,
  onOpenStats,
}: {
  summary: DaySummary
  onOpenSettings: () => void
  onOpenStats: () => void
}) {
  const { t, n } = useI18n()
  const showStats = statsAvailable(useAiCycleState()?.cycle.plan)
  const headline = summary.isOver
    ? t.summary.over(n(summary.over))
    : t.summary.remaining(n(summary.remaining))
  return (
    // The squircle clips the card, and a clip erases an outer box-shadow, so
    // the shadow hangs on a wrapper as a drop-shadow — that one follows the
    // clipped silhouette rather than the border-radius.
    <div className="drop-shadow-[0_8px_30px_rgba(43,32,21,0.12)] dark:drop-shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
      <Squircle
        radius={28}
        outline="solid"
        className="flex items-center gap-4 bg-card p-4"
      >
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label={t.summary.openSettings}
          className="shrink-0 rounded-full transition-transform outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
        >
          <ProgressRing summary={summary} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label={t.summary.openSettings}
              className="rounded-md text-left transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-70"
            >
              <div className="text-lg leading-tight font-bold">{headline}</div>
              <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {t.summary.pctOfGoal(n(summary.pctOfGoal), n(summary.goalKcal))}
              </div>
            </button>
            <AnimatePresence initial={false}>
              {showStats && (
                <motion.button
                  key="stats"
                  type="button"
                  onClick={onOpenStats}
                  aria-label={t.summary.statistics}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  whileTap={{ scale: 0.95 }}
                  transition={SPRING}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-input text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <BarChart3 className="h-4 w-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          <div className="mt-2.5 border-t pt-2.5">
            <Squircle asChild pill>
              <div className="inline-flex items-center rounded-full bg-input p-1 text-xs tabular-nums">
                {MACROS.map((m, i) => (
                  <span key={m.key} className="flex items-center">
                    {i > 0 && <span className="h-3 w-px bg-border" />}
                    <span className="flex items-baseline gap-1 px-2.5">
                      <MacroLetter
                        macro={m}
                        withGrams
                        className="text-[15px]"
                        aria-hidden
                      />
                      <span className="sr-only">{t.macros[m.field]}</span>
                      <span className="font-medium">
                        {n(Math.round(summary.totals[m.field]))}
                        {t.units.g}
                      </span>
                    </span>
                  </span>
                ))}
              </div>
            </Squircle>
          </div>
        </div>
      </Squircle>
    </div>
  )
}

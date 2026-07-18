import * as React from "react"
import { AnimatePresence, motion } from "motion/react"

import type { CoverageLevel } from "@/data/days"
import { useI18n } from "@/lib/i18n/useI18n"
import { SPRING } from "./anim"
import {
  COVERAGE_LEVELS,
  nextCoverageGateChange,
  showCoverageControl,
} from "./coverage"

// The Coverage control (issue #42): the Some / Most / Everything chips at the
// bottom of a Day's Entry list — today's from the evening hour, any past
// Day's whenever it holds Entries (the gate lives in coverage.ts). Keyed off
// the selected Day alone, so it is navigator-agnostic. The stored label reads
// as the one filled chip; tapping reports the level and the parent decides
// what the tap means (set, or clear on the already-stored label).
export function CoverageControl({
  day,
  entryCount,
  level,
  onSelect,
}: {
  day: string
  entryCount: number
  /** The Day's stored label; null while unlabelled (the trusted default). */
  level: CoverageLevel | null
  onSelect: (level: CoverageLevel) => void
}) {
  const { t } = useI18n()

  // The one gate flip that must happen without a tap: today's control
  // appearing at the evening hour while the app sits open. A re-render at the
  // boundary is enough — the gate itself recomputes below.
  const gateMs = nextCoverageGateChange(day, entryCount)?.getTime() ?? null
  const [, rerender] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => {
    if (gateMs === null) return
    const timer = setTimeout(rerender, Math.max(0, gateMs - Date.now()))
    return () => clearTimeout(timer)
  }, [gateMs])

  return (
    <AnimatePresence initial={false}>
      {showCoverageControl(day, entryCount) && (
        <motion.div
          key="coverage"
          layout="position"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={SPRING}
          className="mx-4 pb-3"
        >
          <div className="px-1 text-[11px] text-muted-foreground">
            {t.coverage.question}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 px-1">
            {COVERAGE_LEVELS.map((chip) => (
              <motion.button
                key={chip}
                type="button"
                aria-pressed={level === chip}
                onClick={() => onSelect(chip)}
                whileTap={{ scale: 0.95 }}
                className={
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150 " +
                  (level === chip
                    ? "bg-foreground text-background"
                    : "border bg-card")
                }
              >
                {t.coverage[chip]}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

import { AnimatePresence, motion } from "motion/react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { isToday, relativeDayLabel } from "@/lib/day"

// The Day stepper: prev/next flank a relative label ("Today" / "Yesterday" /
// "Wed 8 Jul"), and a "Today" anchor fades in whenever you've stepped away.
// Both chevrons call the same step as a swipe, so navigation is symmetric and
// forward movement is never blocked (spec § scope).
export function DayNav({
  selectedDay,
  onStep,
  onToday,
}: {
  selectedDay: string
  onStep: (delta: -1 | 1) => void
  onToday: () => void
}) {
  const atToday = isToday(selectedDay)

  return (
    <div className="flex items-center justify-between px-4 pt-1 pb-0.5">
      <motion.button
        type="button"
        onClick={() => onStep(-1)}
        whileTap={{ scale: 0.85 }}
        aria-label="Previous day"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground"
      >
        <ChevronLeft className="h-5 w-5" />
      </motion.button>

      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">
          {relativeDayLabel(selectedDay)}
        </span>
        <AnimatePresence initial={false}>
          {!atToday && (
            <motion.button
              type="button"
              onClick={onToday}
              initial={{ opacity: 0, scale: 0.8, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: "auto" }}
              exit={{ opacity: 0, scale: 0.8, width: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden rounded-full border border-border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
            >
              Today
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <motion.button
        type="button"
        onClick={() => onStep(1)}
        whileTap={{ scale: 0.85 }}
        aria-label="Next day"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground"
      >
        <ChevronRight className="h-5 w-5" />
      </motion.button>
    </div>
  )
}

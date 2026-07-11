import { motion } from "motion/react"

import { weekWindow } from "@/lib/day"
import { SPRING } from "./anim"

// Seven day-chips, today-anchored, ending in exactly one future day (dashed +
// dimmed). Today is ink-inverted; the selected Day carries a sliding ink ring
// that animates between chips; a dot marks Days with Entries. Tapping a chip
// selects that Day.
export function WeekStrip({
  selectedDay,
  loggedDays,
  onSelect,
}: {
  selectedDay: string
  loggedDays: Set<string>
  onSelect: (day: string) => void
}) {
  const cells = weekWindow(selectedDay)

  return (
    <div className="flex justify-between px-4 py-2">
      {cells.map((cell) => {
        const logged = loggedDays.has(cell.day)
        // Future chips dim, unless they are the one you're viewing.
        const dim = cell.isFuture && !cell.isSelected
        return (
          <button
            key={cell.day}
            type="button"
            aria-label={cell.day}
            aria-current={cell.isSelected ? "date" : undefined}
            onClick={() => onSelect(cell.day)}
            className={
              "relative flex w-11 flex-col items-center gap-0.5 rounded-full py-2 " +
              (cell.isToday
                ? "bg-foreground text-background"
                : cell.isFuture
                  ? "border border-dashed border-[#cbbfa4] dark:border-[#4a3e2e]"
                  : "") +
              (dim ? " opacity-60" : "")
            }
          >
            {/* Sliding selection ring — invisible over the inverted today chip,
                which already reads as current. */}
            {cell.isSelected && !cell.isToday && (
              <motion.span
                layoutId="week-selection"
                transition={SPRING}
                className="pointer-events-none absolute inset-0 rounded-full border-2 border-foreground"
              />
            )}
            <span
              className={
                "text-[10px] " +
                (cell.isToday ? "opacity-70" : "text-muted-foreground")
              }
            >
              {cell.weekday}
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {cell.dayNum}
            </span>
            <span
              className={
                "h-1 w-1 rounded-full " +
                (logged
                  ? cell.isToday
                    ? "bg-background/70"
                    : "bg-[#b9ab92] dark:bg-[#5a4c3b]"
                  : "bg-transparent")
              }
            />
          </button>
        )
      })}
    </div>
  )
}

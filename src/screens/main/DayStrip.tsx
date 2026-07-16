import * as React from "react"
import { motion } from "motion/react"

import { stripWindow } from "@/lib/day"
import { SPRING } from "./anim"

// The sole day navigator (#33, ADR 0008): a free-scrolling rail of Day chips —
// 14 days back through today plus one dashed, dimmed frontier Day. Selection
// is a single filled ink pill that travels between chips; today, when not
// selected, keeps a soft accent tint so it stays findable. Tapping the
// frontier selects it and reveals the next future Day; a dot marks Days with
// Entries.
export function DayStrip({
  selectedDay,
  loggedDays,
  onSelect,
}: {
  selectedDay: string
  loggedDays: Set<string>
  onSelect: (day: string) => void
}) {
  const cells = stripWindow(selectedDay)
  const railRef = React.useRef<HTMLDivElement>(null)
  const mounted = React.useRef(false)
  const selectedIsFuture = cells.find((c) => c.isSelected)?.isFuture ?? false

  // Keep the action in view: on open, jump (no animation) so today hugs the
  // right edge with the frontier beyond it and the past off-screen left;
  // afterwards, ease the selected chip into view. For a future selection the
  // target is the freshly revealed frontier instead — it sits beside the
  // selection, so the reveal and the selection both stay visible.
  React.useLayoutEffect(() => {
    const rail = railRef.current
    if (!rail) return
    if (!mounted.current) {
      mounted.current = true
      rail.scrollLeft = rail.scrollWidth
      return
    }
    const target = selectedIsFuture
      ? (rail.lastElementChild as HTMLElement | null)
      : rail.querySelector<HTMLElement>('[aria-current="date"]')
    // Match the app-wide reduced-motion contract (spec § Motion): movement
    // snaps, fades remain. MotionConfig can't reach this native scroll, so
    // gate it by hand.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    target?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      inline: "nearest",
      block: "nearest",
    })
  }, [selectedDay, selectedIsFuture])

  return (
    <div
      ref={railRef}
      className="flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
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
              "relative flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-full py-2 " +
              (cell.isFrontier
                ? "border border-dashed border-[#cbbfa4] dark:border-[#4a3e2e]"
                : cell.isToday && !cell.isSelected
                  ? "bg-accent"
                  : "") +
              (dim ? " opacity-60" : "")
            }
          >
            {/* The filled ink selection pill. Travel between chips is legal
                only because every chip is the same fixed size (w-11); if chip
                sizes ever diverge it must become a cross-fade (spec § Motion,
                ADR 0007). */}
            {cell.isSelected && (
              <motion.span
                layoutId="day-selection"
                transition={SPRING}
                className="pointer-events-none absolute inset-0 rounded-full bg-foreground"
              />
            )}
            <span
              className={
                "relative text-[10px] " +
                (cell.isSelected
                  ? "text-background opacity-70"
                  : cell.isToday
                    ? "text-accent-foreground"
                    : "text-muted-foreground")
              }
            >
              {cell.weekday}
            </span>
            <span
              className={
                "relative text-sm font-semibold tabular-nums" +
                (cell.isSelected ? " text-background" : "")
              }
            >
              {cell.dayNum}
            </span>
            <span
              className={
                "relative h-1 w-1 rounded-full " +
                (logged
                  ? cell.isSelected
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

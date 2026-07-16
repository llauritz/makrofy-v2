import * as React from "react"
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react"

import { stripWindow, type DayCell } from "@/lib/day"
import { SPRING } from "./anim"

// The sole day navigator (#33, ADR 0008): a free-scrolling rail of Day chips —
// 14 days back through today plus one dashed, dimmed frontier Day. Today, when
// not selected, carries a soft outline ring so it stays findable; a dot marks
// Days with Entries; tapping the frontier selects it and reveals the next Day.
//
// Selection is a single filled ink pill that *travels* between chips. Rather
// than fade each chip's text between palettes — which flashes invisible while
// the fill is elsewhere — the strip is drawn twice: a base layer in ink, and an
// inverted (background-ink) copy that is only ever seen through the pill's
// window. The pill is an overflow-clipped mask; its inner copy is counter-
// translated by the same spring, so the two layers stay pixel-aligned and the
// pill simply uncovers whichever chip it slides over. No color ever flips and
// nothing fades. Travel is legal only because every chip is the same fixed size
// (w-11); if chip sizes ever diverge the mask must become a cross-fade (spec
// § Motion, ADR 0007).
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
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const rowRef = React.useRef<HTMLDivElement>(null)
  const mounted = React.useRef(false)
  const shouldReduce = useReducedMotion()
  const selectedIsFuture = cells.find((c) => c.isSelected)?.isFuture ?? false

  // The pill's horizontal offset within the rail's content; the inverted copy
  // rides the negative of it, cancelling the pill's own travel so it holds
  // still behind the moving window. One source value keeps them in lockstep.
  const pillX = useMotionValue(0)
  const innerX = useTransform(pillX, (v) => -v)
  const [pill, setPill] = React.useState<{
    top: number
    width: number
    height: number
  } | null>(null)

  // Slide the pill onto the selected chip. Chips are uniform, so the selected
  // button's box is the pill's box; only x differs per selection. Snap on first
  // paint and under reduced motion (spec § Motion: movement snaps); else spring.
  React.useLayoutEffect(() => {
    const btn =
      rowRef.current?.querySelector<HTMLElement>('[aria-current="date"]')
    if (!btn) return // off-strip selection (#34) has no chip to mask
    setPill({ top: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight })
    if (!mounted.current || shouldReduce) {
      pillX.set(btn.offsetLeft)
      return
    }
    const controls = animate(pillX, btn.offsetLeft, SPRING)
    return () => controls.stop()
  }, [selectedDay, shouldReduce, pillX])

  // Keep the action in view: on open, jump (no animation) so today hugs the
  // right edge with the frontier beyond it and the past off-screen left;
  // afterwards, glide the selected chip into view. For a future selection the
  // target is the freshly revealed frontier instead — it sits beside the
  // selection, so the reveal and the selection both stay visible.
  React.useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    if (!mounted.current) {
      mounted.current = true
      scroller.scrollLeft = scroller.scrollWidth
      return
    }
    const target = selectedIsFuture
      ? (rowRef.current?.lastElementChild as HTMLElement | null)
      : rowRef.current?.querySelector<HTMLElement>('[aria-current="date"]')
    if (!target) return
    // Let a plain nearest-scroll tell us where to land, then glide there
    // ourselves — the browser's native smooth scroll is too brisk, especially
    // the long hop home from deep in the future. Measuring is invisible: it
    // runs inside a layout effect and we restore the scroll before paint.
    const from = scroller.scrollLeft
    target.scrollIntoView({ block: "nearest", inline: "nearest" })
    const to = scroller.scrollLeft
    if (to === from) return
    if (shouldReduce) return // movement snaps: leave it at `to`
    scroller.scrollLeft = from
    const controls = animate(from, to, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1], // easeOutQuint — a gentle, soft-landing glide
      onUpdate: (v) => {
        scroller.scrollLeft = v
      },
    })
    return () => controls.stop()
  }, [selectedDay, selectedIsFuture, shouldReduce])

  return (
    <div
      ref={scrollRef}
      className="relative overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/* Base layer — every chip in ink, always in its unselected palette. */}
      <div ref={rowRef} className="flex w-max gap-1">
        {cells.map((cell) => (
          <button
            key={cell.day}
            type="button"
            aria-label={cell.day}
            aria-current={cell.isSelected ? "date" : undefined}
            onClick={() => onSelect(cell.day)}
            className={
              "flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-full py-2 " +
              (cell.isFrontier
                ? "border border-dashed border-[#cbbfa4] dark:border-[#4a3e2e]"
                : cell.isToday && !cell.isSelected
                  ? "ring-1 ring-inset ring-[#cbbfa4] dark:ring-[#4a3e2e]"
                  : "") +
              (cell.isFuture && !cell.isSelected ? " opacity-60" : "")
            }
          >
            <ChipFace cell={cell} logged={loggedDays.has(cell.day)} inverted={false} />
          </button>
        ))}
      </div>

      {/* Mask layer — the ink pill, clipping an inverted copy of the same row.
          Only the chip under the pill is ever visible here. */}
      {pill && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-0 overflow-hidden rounded-full bg-foreground"
          style={{ top: pill.top, width: pill.width, height: pill.height, x: pillX }}
        >
          <motion.div
            className="absolute top-0 left-0 flex w-max gap-1 px-4"
            style={{ x: innerX }}
          >
            {cells.map((cell) => (
              <div
                key={cell.day}
                className="flex w-11 shrink-0 flex-col items-center gap-0.5 py-2"
              >
                <ChipFace cell={cell} logged={loggedDays.has(cell.day)} inverted />
              </div>
            ))}
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

// The weekday / day-number / logged-dot stack, in one of two palettes. `false`
// is the base ink face; `inverted` is the background-ink face shown through the
// selection pill. Kept in one place so the two layers can never drift in
// layout — only in color.
function ChipFace({
  cell,
  logged,
  inverted,
}: {
  cell: DayCell
  logged: boolean
  inverted: boolean
}) {
  return (
    <>
      <span
        className={
          "text-[10px] " +
          (inverted
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
          "text-sm font-semibold tabular-nums" +
          (inverted ? " text-background" : "")
        }
      >
        {cell.dayNum}
      </span>
      <span
        className={
          "h-1 w-1 rounded-full " +
          (logged
            ? inverted
              ? "bg-background/70"
              : "bg-[#b9ab92] dark:bg-[#5a4c3b]"
            : "bg-transparent")
        }
      />
    </>
  )
}

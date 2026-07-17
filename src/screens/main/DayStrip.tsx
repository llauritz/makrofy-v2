import * as React from "react"
import { CalendarDays } from "lucide-react"
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react"

import { isOffStrip, shortDayLabel, stripWindow, type DayCell } from "@/lib/day"
import { FADE_IN, FADE_OUT, SPRING } from "./anim"

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
  onOpenCalendar,
}: {
  selectedDay: string
  loggedDays: Set<string>
  onSelect: (day: string) => void
  onOpenCalendar: () => void
}) {
  const cells = stripWindow(selectedDay)
  // Beyond the strip's reach the selection has no chip: the calendar button
  // itself carries the Day's date and reopens the picker (#34).
  const offStrip = isOffStrip(selectedDay)
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
  // button's box is the pill's box; only x differs per selection. Travel is
  // only legal between two visible anchors: re-appearing after an off-strip
  // spell (or first paint, or reduced motion) snaps into place — the mount
  // fade below is the entrance, springing from the stale position is not.
  const hadPill = React.useRef(false)
  React.useLayoutEffect(() => {
    const btn = rowRef.current?.querySelector<HTMLElement>(
      '[aria-current="date"]'
    )
    if (!btn) {
      setPill(null) // off-strip selection (#34): no chip, no pill
      hadPill.current = false
      return
    }
    setPill({
      top: btn.offsetTop,
      width: btn.offsetWidth,
      height: btn.offsetHeight,
    })
    const appearing = !hadPill.current
    hadPill.current = true
    if (!mounted.current || appearing || shouldReduce) {
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
    // Off-strip there is no chip to show — the destination is the rail's
    // leading end, where the calendar button now carries the Day's date.
    // Otherwise let a plain nearest-scroll tell us where to land, then glide
    // there ourselves — the browser's native smooth scroll is too brisk,
    // especially the long hop home from deep in the future. Measuring is
    // invisible: it runs inside a layout effect and we restore the scroll
    // before paint.
    const from = scroller.scrollLeft
    if (target) target.scrollIntoView({ block: "nearest", inline: "nearest" })
    else if (isOffStrip(selectedDay)) scroller.scrollLeft = 0
    else return
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
      className="relative [scrollbar-width:none] overflow-x-auto px-4 py-2 [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max gap-1">
        {/* The calendar lives inside the rail, past the oldest chip: scroll
            to the end of the recent two weeks and it appears — "keep going
            further back". Off-strip it fills like the selection pill and
            carries the Day's date (the rail auto-scrolls to show it), so
            "where am I?" always has an answer. The expansion follows the
            motion vocabulary (spec § Motion): the box makes space by
            springing its real width — the label slot animates 0 ↔ auto while
            the padding stays constant — and the date plus the ink fill fade
            in place. */}
        <button
          type="button"
          aria-label={
            offStrip
              ? `Open calendar, ${shortDayLabel(selectedDay)}`
              : "Open calendar"
          }
          onClick={onOpenCalendar}
          className={
            "flex h-9 shrink-0 items-center self-center rounded-full px-[9px] transition-colors duration-150 " +
            (offStrip
              ? "bg-foreground text-background"
              : "text-muted-foreground")
          }
        >
          <CalendarDays className="h-[18px] w-[18px] shrink-0" />
          <motion.span
            aria-hidden={!offStrip}
            className="overflow-hidden"
            initial={false}
            animate={{
              width: offStrip ? "auto" : 0,
              opacity: offStrip ? 1 : 0,
            }}
            transition={
              shouldReduce
                ? { duration: 0 }
                : { width: SPRING, opacity: offStrip ? FADE_IN : FADE_OUT }
            }
          >
            <span className="block pl-1.5 text-sm font-semibold whitespace-nowrap">
              {shortDayLabel(selectedDay)}
            </span>
          </motion.span>
        </button>

        {/* The chips get their own positioning context so the pill's
            coordinates never include the calendar button: while the button
            animates its width, this whole block reflows as one and carries
            the pill with it — measured offsets stay valid mid-animation. */}
        <div ref={rowRef} className="relative flex gap-1">
          {/* Mask layer — the ink pill, clipping an inverted copy of the
              chip row. Only the chip under the pill is ever visible here.
              Declared before the chips but painted above them (positioned +
              transformed), so the frontier chip stays the row's last child
              for the auto-scroll. */}
          {pill && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute left-0 overflow-hidden rounded-full bg-foreground"
              // The pill mounts fresh whenever it re-appears (first paint, or
              // returning from off-strip): appearing content fades in place.
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={shouldReduce ? { duration: 0 } : FADE_IN}
              style={{
                top: pill.top,
                width: pill.width,
                height: pill.height,
                x: pillX,
              }}
            >
              <motion.div
                className="absolute top-0 left-0 flex w-max gap-1"
                style={{ x: innerX }}
              >
                {cells.map((cell) => (
                  <div
                    key={cell.day}
                    className="flex w-11 shrink-0 flex-col items-center gap-0.5 py-2"
                  >
                    <ChipFace
                      cell={cell}
                      logged={loggedDays.has(cell.day)}
                      inverted
                    />
                  </div>
                ))}
              </motion.div>
            </motion.div>
          )}

          {/* Base layer — every chip in ink, always in its unselected
              palette. */}
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
                    ? "ring-1 ring-[#cbbfa4] ring-inset dark:ring-[#4a3e2e]"
                    : "") +
                (cell.isFuture && !cell.isSelected ? " opacity-60" : "")
              }
            >
              <ChipFace
                cell={cell}
                logged={loggedDays.has(cell.day)}
                inverted={false}
              />
            </button>
          ))}
        </div>
      </div>
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

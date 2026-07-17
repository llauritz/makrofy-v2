import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet"
import {
  isFuture,
  isToday,
  monthGrid,
  monthOf,
  monthTitle,
  stepMonth,
  WEEKDAY_NARROW,
} from "@/lib/day"

// The deep-jump surface (#34, ADR 0008): a month-grid bottom sheet that
// reaches any date, past or future — the Day strip covers the recent two
// weeks, this covers everything else. Days holding Entries are dotted from
// the full-history logged-Days set (the derived index of ADR 0005), today
// keeps the strip's outline ring, and the selection keeps its filled ink
// pill, so the grid speaks the same visual language as the strip. Picking a
// Day is the whole interaction: it selects and closes.
export function CalendarSheet({
  open,
  onOpenChange,
  selectedDay,
  loggedDays,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedDay: string
  loggedDays: Set<string>
  onPick: (day: string) => void
}) {
  const [month, setMonth] = React.useState(() => monthOf(selectedDay))

  // Each opening starts at the selected Day's month — the sheet answers
  // "where am I?" before it answers "where to?". Render-time adjustment, not
  // an effect: the reset must land in the same paint as the sheet itself.
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setMonth(monthOf(selectedDay))
  }

  const cells = monthGrid(month)

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="gap-4">
        <div className="flex items-center justify-between">
          <BottomSheetTitle className="text-lg font-semibold">
            {monthTitle(month)}
          </BottomSheetTitle>
          <div className="flex items-center gap-1">
            <PagerButton
              label="Previous month"
              onClick={() => setMonth(stepMonth(month, -1))}
            >
              <ChevronLeft className="h-[18px] w-[18px]" />
            </PagerButton>
            <PagerButton
              label="Next month"
              onClick={() => setMonth(stepMonth(month, 1))}
            >
              <ChevronRight className="h-[18px] w-[18px]" />
            </PagerButton>
            <BottomSheetClose />
          </div>
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {WEEKDAY_NARROW.map((w, i) => (
            <span
              key={i}
              aria-hidden
              className="text-center text-[10px] text-muted-foreground"
            >
              {w}
            </span>
          ))}
          {cells.map((cell) => {
            const selected = cell.day === selectedDay
            const today = isToday(cell.day)
            return (
              <button
                key={cell.day}
                type="button"
                aria-label={cell.day}
                aria-current={selected ? "date" : undefined}
                onClick={() => onPick(cell.day)}
                className={
                  "mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-full " +
                  (selected
                    ? "bg-foreground text-background"
                    : today
                      ? "ring-1 ring-[#cbbfa4] ring-inset dark:ring-[#4a3e2e]"
                      : "") +
                  (!cell.inMonth
                    ? " text-muted-foreground/50"
                    : !selected && isFuture(cell.day)
                      ? " opacity-60"
                      : "")
                }
              >
                <span className="text-sm font-medium tabular-nums">
                  {cell.dayNum}
                </span>
                <span
                  className={
                    "h-1 w-1 rounded-full " +
                    (loggedDays.has(cell.day)
                      ? selected
                        ? "bg-background/70"
                        : "bg-[#b9ab92] dark:bg-[#5a4c3b]"
                      : "bg-transparent")
                  }
                />
              </button>
            )
          })}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}

function PagerButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
    >
      {children}
    </button>
  )
}

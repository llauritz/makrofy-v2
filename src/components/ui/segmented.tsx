import * as React from "react"
import { motion } from "motion/react"

import { Squircle } from "@/components/ui/squircle"
import { cn } from "@/lib/utils"
import { FADE_IN, SPRING } from "@/screens/main/anim"

// A pill segmented control (radiogroup), shared by Settings, the onboarding
// daily-need sheet and the paywall's billing toggle; `value` may be null while nothing is chosen yet.
//
// The selection is one pill that slides between the segments. It is an
// indicator, so travel is its message (spec § Motion), and the segments are
// equal-width so it only ever moves between same-size anchors. The very
// first choice (from nothing) fades the pill in where it lands instead, since
// nothing may move and fade at once.
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "sm",
}: {
  value: T | null
  onChange: (value: T) => void
  /** `tag` is a small badge beside the label (the paywall's saving). */
  options: ReadonlyArray<{ value: T; label: string; tag?: string }>
  ariaLabel: string
  /** `sm` for Settings rows; `md` is the roomier form control (onboarding). */
  size?: "sm" | "md"
}) {
  const index = options.findIndex((option) => option.value === value)
  const chosen = index >= 0

  // Travel only when moving from one choice to another; appearing from no
  // choice snaps into place. State-adjust-during-render, no effect needed.
  const [prevIndex, setPrevIndex] = React.useState(index)
  const [travels, setTravels] = React.useState(false)
  if (prevIndex !== index) {
    setPrevIndex(index)
    setTravels(prevIndex >= 0)
  }

  return (
    <Squircle asChild pill>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="relative flex rounded-full bg-input p-1"
      >
        {/* The squircle's clip would erase a box-shadow, so the pill's shadow
            hangs on its wrapper as a drop-shadow instead. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-1 drop-shadow-[0_1px_1px_rgba(43,32,21,0.12)]"
          style={{ width: `calc((100% - 0.5rem) / ${options.length})` }}
          initial={false}
          animate={{
            x: `${Math.max(index, 0) * 100}%`,
            opacity: chosen ? 1 : 0,
          }}
          transition={{
            x: travels ? SPRING : { duration: 0 },
            opacity: FADE_IN,
          }}
        >
          <Squircle pill className="h-full w-full bg-card" />
        </motion.div>
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "relative flex flex-1 basis-0 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition-colors duration-200",
                size === "md" ? "px-2 py-2.5" : "px-3 py-1.5",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
              {option.tag && (
                <Squircle asChild pill>
                  <span className="bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">
                    {option.tag}
                  </span>
                </Squircle>
              )}
            </button>
          )
        })}
      </div>
    </Squircle>
  )
}

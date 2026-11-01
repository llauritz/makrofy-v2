import { Squircle } from "@/components/ui/squircle"
import { cn } from "@/lib/utils"

// A pill segmented control (radiogroup), shared by Settings and the onboarding
// daily-need sheet; `value` may be null while nothing is chosen yet. The active
// segment is marked by fill, not motion — nothing moves, so there is no layout
// jump between choices.
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "sm",
}: {
  value: T | null
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
  ariaLabel: string
  /** `sm` for Settings rows; `md` is the roomier form control (onboarding). */
  size?: "sm" | "md"
}) {
  return (
    <Squircle asChild pill>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="flex gap-1 rounded-full bg-input p-1"
      >
        {options.map((option) => {
          const active = option.value === value
          // The squircle's clip would erase the active segment's box-shadow,
          // so it hangs on a wrapper as a drop-shadow instead.
          return (
            <div
              key={option.value}
              className={cn(
                "flex flex-1",
                active && "drop-shadow-[0_1px_1px_rgba(43,32,21,0.12)]"
              )}
            >
              <Squircle asChild pill>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange(option.value)}
                  className={cn(
                    "flex-1 rounded-full px-3 text-[13px] font-medium transition-colors",
                    size === "md" ? "px-2 py-2.5" : "py-1.5",
                    active
                      ? "bg-card text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              </Squircle>
            </div>
          )
        })}
      </div>
    </Squircle>
  )
}

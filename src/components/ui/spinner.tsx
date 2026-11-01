import { cn } from "@/lib/utils"

// The app's one quiet spinner: a faint ring with a short arc turning on it.
// Shared by the "still updating" slot under the log (DaySyncSpinner) and the
// launch splash. Decorative: callers carry any meaning in their own labels.
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={cn(
        "h-[18px] w-[18px] opacity-70 motion-safe:animate-[spin_0.9s_linear_infinite]",
        className
      )}
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="1.75"
      />
      <path
        d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

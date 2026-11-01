import * as React from "react"
import { AnimatePresence, motion } from "motion/react"

import { FADE_IN, FADE_OUT } from "./anim"

// Not-yet-confirmed waits shorter than this never show the spinner at all: on
// a good connection the server confirms the Day well inside it, and a spinner
// that blinks on and off reads as a glitch, not as "updating".
const SHOW_AFTER_MS = 300

// A Day still unconfirmed after this long isn't "updating" any more — the
// connection is stuck, and that is the header sync indicator's story
// (SLOW_SYNC_MS in src/lib/sync.ts), not a spinner that spins forever.
const GIVE_UP_MS = 10_000

/**
 * The faint "still updating" mark under the log: shown while the selected
 * Day's data is on screen from the cache but not yet confirmed by the server
 * (`active`, from useDaySyncing) — on launch, after a return to the app, on a
 * Day switch. Deliberately whisper-quiet, and anchored in a zero-height slot
 * in the gap below the list, so it appears and disappears without moving
 * anything. Decorative only: the log itself is already readable and usable.
 */
export function DaySyncSpinner({ active }: { active: boolean }) {
  const [shown, setShown] = React.useState(false)
  // Hide the moment the Day is confirmed (adjust-state-during-render, as in
  // useSyncStatus) — only the appearance waits.
  if (!active && shown) setShown(false)

  React.useEffect(() => {
    if (!active) return
    const show = setTimeout(() => setShown(true), SHOW_AFTER_MS)
    const giveUp = setTimeout(() => setShown(false), GIVE_UP_MS)
    return () => {
      clearTimeout(show)
      clearTimeout(giveUp)
    }
  }, [active])

  return (
    <div aria-hidden className="pointer-events-none relative mx-4 h-0">
      <AnimatePresence>
        {shown && (
          <motion.div
            key="spinner"
            data-sync-spinner
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: FADE_IN }}
            exit={{ opacity: 0, transition: FADE_OUT }}
            className="absolute -top-[11px] left-1/2 -translate-x-1/2 text-muted-foreground"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-2.5 w-2.5 opacity-50 motion-safe:animate-[spin_1.1s_linear_infinite]"
            >
              <circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.25"
                strokeWidth="2"
              />
              <path
                d="M8 2a6 6 0 0 1 6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

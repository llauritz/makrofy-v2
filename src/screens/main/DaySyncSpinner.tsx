import * as React from "react"
import { AnimatePresence, motion } from "motion/react"

import { Spinner } from "@/components/ui/spinner"
import { SPRING } from "./anim"

// Not-yet-confirmed waits shorter than this never show the spinner at all: on
// a good connection the server confirms the Day well inside it, so the spinner
// only appears when there is a real wait to signal — one that blinks on and
// off reads as a glitch, not as "updating".
const SHOW_AFTER_MS = 500

// The slot the spinner makes below the log: the list's own bottom padding plus
// this gives the spinner clear air from the last card.
const SLOT_HEIGHT = 36

// Arriving and leaving both fade gently — the spinner settles in and drifts
// out rather than snapping, and the slot opens and closes on the shared spring
// (space-making, spec § Motion), closing only once the fade is under way.
const FADE = { duration: 0.25, ease: "easeOut" } as const

// A Day still unconfirmed after this long isn't "updating" any more — the
// connection is stuck, and that is the header sync indicator's story
// (SLOW_SYNC_MS in src/lib/sync.ts), not a spinner that spins forever.
const GIVE_UP_MS = 10_000

/**
 * The "still updating" spinner under the log: shown while the selected Day's
 * data is on screen from the cache but not yet confirmed by the server
 * (`active`, from useDaySyncing) — on launch, after a return to the app, on a
 * Day switch — and only once that wait outlasts SHOW_AFTER_MS. It makes its
 * own space below the last card, quiet but plainly visible, and fades out the
 * moment the Day is confirmed. The log itself stays readable and usable
 * throughout; the spinner only says newer data may still arrive.
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
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          key="spinner"
          data-sync-spinner
          aria-hidden
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: SLOT_HEIGHT,
            opacity: 1,
            transition: { height: SPRING, opacity: FADE },
          }}
          exit={{
            height: 0,
            opacity: 0,
            transition: { opacity: FADE, height: { ...SPRING, delay: 0.15 } },
          }}
          className="pointer-events-none flex items-start justify-center overflow-hidden text-muted-foreground"
        >
          <Spinner className="mt-1.5" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

import { motion } from "motion/react"
import * as React from "react"

import { FADE_OUT } from "@/screens/main/anim"

// A soft double pulse over a Settings row, for when something elsewhere sends
// the user here to find it: the header's "Sync data" opens Settings with the
// sign-in row blinking. It waits for the sheet to finish sliding up, brings
// the row into view if the sheet is scrolled, then fades a tint in and out
// twice over a second. Only opacity moves, on a layer of its own beneath the
// row's content, so the text never repaints and nothing flickers. The parent
// must be `relative isolate` and squircle-clipped: the clip shapes the tint.

/** BottomSheetContent's slide-up, in seconds. */
const SHEET_IN = 0.3
/** The whole blink, both pulses. */
const BLINK = 1

export function RowBlink({ active }: { active: boolean }) {
  const ref = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    if (!active) return
    const row = ref.current?.parentElement
    const id = setTimeout(
      () => row?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      SHEET_IN * 1000
    )
    return () => clearTimeout(id)
  }, [active])

  return (
    <motion.span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 bg-primary/[0.09] dark:bg-primary/[0.12]"
      initial={{ opacity: 0 }}
      animate={active ? { opacity: [0, 1, 0.3, 1, 0] } : { opacity: 0 }}
      transition={
        active
          ? {
              duration: BLINK,
              delay: SHEET_IN,
              times: [0, 0.22, 0.5, 0.72, 1],
              ease: "easeInOut",
            }
          : FADE_OUT
      }
    />
  )
}

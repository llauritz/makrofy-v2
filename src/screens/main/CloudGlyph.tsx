import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import * as React from "react"

import type { CloudGlyph as Glyph } from "@/lib/cloud-button"

// The cloud in the header button, drawn on one 24-unit grid with Lucide's
// stroke so it sits beside the gear as a sibling. The outline never changes;
// only what is inside it does:
//   off       — a slash draws across it, cutting the cloud where it crosses
//   uploading — a small arrow rises through it, over and over, while changes
//               are on their way up
//   cloud     — empty; arriving here from "uploading" draws a brief check
//               first, then lets it fade, so a finished sync is acknowledged
//               once and then left quiet.

// Lucide's `cloud`.
const CLOUD = "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"
const SLASH = "M2 2l20 20"
const ARROW_SHAFT = "M12 17.5v-5.5"
const ARROW_HEAD = "M9.5 14.5 12 12l2.5 2.5"
const CHECK = "M9 14.5l2 2 4-4"

const DRAW = { duration: 0.32, ease: [0.4, 0, 0.2, 1] } as const
const CHECK_HOLD_MS = 1400

export function CloudGlyph({
  glyph,
  className,
}: {
  glyph: Glyph
  className?: string
}) {
  const reduce = useReducedMotion()
  const maskId = React.useId()
  const off = glyph === "off"

  // The check only follows a finished upload, never a cold "cloud".
  const [checking, setChecking] = React.useState(false)
  const prev = React.useRef(glyph)
  React.useEffect(() => {
    const was = prev.current
    prev.current = glyph
    if (was === "uploading" && glyph === "cloud") {
      setChecking(true)
      const t = setTimeout(() => setChecking(false), CHECK_HOLD_MS)
      return () => clearTimeout(t)
    }
    setChecking(false)
  }, [glyph])

  const draw = reduce ? { duration: 0 } : DRAW

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect width="24" height="24" fill="white" />
          {/* The gap the slash cuts, drawn in step with the slash itself. */}
          <motion.path
            d={SLASH}
            stroke="black"
            strokeWidth={6}
            initial={false}
            animate={{ pathLength: off ? 1 : 0, opacity: off ? 1 : 0 }}
            transition={draw}
          />
        </mask>
      </defs>

      <path d={CLOUD} mask={`url(#${maskId})`} />

      <motion.path
        d={SLASH}
        initial={false}
        animate={{ pathLength: off ? 1 : 0, opacity: off ? 1 : 0 }}
        transition={draw}
      />

      <AnimatePresence>
        {glyph === "uploading" && (
          <motion.g
            key="arrow"
            strokeWidth={1.75}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            <motion.g
              animate={
                reduce
                  ? undefined
                  : { y: [2, 1, -0.5, -1.5], opacity: [0, 1, 1, 0] }
              }
              transition={{
                duration: 1.3,
                ease: "linear",
                repeat: Infinity,
                repeatDelay: 0.15,
                times: [0, 0.25, 0.75, 1],
              }}
            >
              <path d={ARROW_SHAFT} />
              <path d={ARROW_HEAD} />
            </motion.g>
          </motion.g>
        )}
        {checking && (
          <motion.path
            key="check"
            d={CHECK}
            strokeWidth={1.75}
            initial={{ pathLength: 0, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            transition={draw}
          />
        )}
      </AnimatePresence>
    </svg>
  )
}

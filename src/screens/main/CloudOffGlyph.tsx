import { motion, useReducedMotion } from "motion/react"
import * as React from "react"

// The crossed-out cloud in the header button, drawn on one 24-unit grid with
// Lucide's stroke so it sits beside the gear as a sibling. The slash draws
// across as it appears, cutting the cloud where it crosses (a mask stroked in
// step with it), so the cloud reads as being switched off rather than just
// popping in.

// Lucide's `cloud`.
const CLOUD = "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"
const SLASH = "M2 2l20 20"

const DRAW = { duration: 0.32, ease: [0.4, 0, 0.2, 1], delay: 0.1 } as const

export function CloudOffGlyph({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  const maskId = React.useId()
  const slash = {
    initial: reduce ? false : ({ pathLength: 0 } as const),
    animate: { pathLength: 1 },
    transition: DRAW,
  }

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
          <motion.path d={SLASH} stroke="black" strokeWidth={6} {...slash} />
        </mask>
      </defs>
      <path d={CLOUD} mask={`url(#${maskId})`} />
      <motion.path d={SLASH} {...slash} />
    </svg>
  )
}

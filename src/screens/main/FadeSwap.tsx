import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { FADE_IN, FADE_OUT, SPRING } from "./anim"

// The card primitive of the motion law (spec § Motion, ADR 0007): the box
// makes space, the content fades. When `swapKey` changes, the old child fades
// out at the old size, then the box springs to the new child's height while
// it fades in (mode="wait" sequences the two — a fade-through). The card
// chrome belongs on `className` here, so the box visually persists while its
// contents change; children must bring padding but no border/background.
// Height is animated for real — never via layout-scale, which stretches.
export function FadeSwap({
  swapKey,
  className,
  children,
}: {
  swapKey: string
  className?: string
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [height, setHeight] = React.useState<number>()
  // Motion's reducedMotion="user" only snaps transforms; height is a plain
  // style value, so the box needs its own guard to snap with everything else.
  const reduce = useReducedMotion()

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setHeight(el.getBoundingClientRect().height)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <motion.div
      initial={false}
      // `animate` must be defined from the very first render ("auto" until
      // measured): mounting with animate=undefined leaves the box unclamped,
      // and the first swap then jumps instead of springing.
      animate={{ height: height ?? "auto" }}
      transition={reduce ? { duration: 0 } : SPRING}
      className={"overflow-hidden " + (className ?? "")}
    >
      <div ref={ref}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={swapKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: FADE_IN }}
            exit={{ opacity: 0, transition: FADE_OUT }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

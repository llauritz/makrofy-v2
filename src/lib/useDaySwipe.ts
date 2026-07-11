import * as React from "react"

// A horizontal swipe steps the Day, symmetric with the prev/next buttons
// (spec § scope — fixes V1's button-vs-swipe asymmetry). The gesture is judged
// only on pointer-up and nothing is prevented mid-move, so vertical scrolling
// and taps on inner controls keep working untouched.
const DISTANCE = 60 // px of horizontal travel to count as a swipe
const DOMINANCE = 1.5 // horizontal must beat vertical by this factor
const MAX_MS = 800 // slower drags read as scrolls, not swipes

interface Start {
  x: number
  y: number
  t: number
}

export function useDaySwipe(onSwipe: (delta: -1 | 1) => void) {
  const start = React.useRef<Start | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    // A drag beginning inside a text field is caret placement / text selection,
    // not a Day swipe — leave it to the input so editing isn't hijacked.
    const target = e.target
    if (
      target instanceof Element &&
      target.closest("input, textarea, select, [contenteditable='true']")
    ) {
      start.current = null
      return
    }
    start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const from = start.current
    start.current = null
    if (!from) return
    const dx = e.clientX - from.x
    const dy = e.clientY - from.y
    const horizontal =
      Math.abs(dx) >= DISTANCE && Math.abs(dx) >= Math.abs(dy) * DOMINANCE
    if (!horizontal || e.timeStamp - from.t > MAX_MS) return
    // Content follows the finger: dragging left reveals the next Day.
    onSwipe(dx < 0 ? 1 : -1)
  }

  // Cancel a tracked gesture that leaves the element or is interrupted.
  const onPointerCancel = () => {
    start.current = null
  }

  return { onPointerDown, onPointerUp, onPointerCancel }
}

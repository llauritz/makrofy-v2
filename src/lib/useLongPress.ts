import * as React from "react"

// Hold-to-fire on a pressable element (#73): pointerdown arms a timer, and a
// hold past the threshold fires once. Release, cancel, or wandering past the
// slop disarms — a scroll or a short tap never triggers. A fired hold swallows
// the click the release still dispatches (capture phase, so the element's own
// onClick never runs) and the context menu stays shut. Spread the returned
// handlers on the element alongside its own onClick; give it select-none so
// mobile browsers don't start a text selection mid-hold.
const HOLD_MS = 500
const SLOP_PX = 10

export function useLongPress(onLongPress: () => void) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  const origin = React.useRef<{ x: number; y: number } | null>(null)
  const fired = React.useRef(false)

  const disarm = () => {
    origin.current = null
    if (timer.current !== undefined) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
  }
  React.useEffect(() => disarm, [])

  const onPointerDown = (e: React.PointerEvent) => {
    disarm()
    fired.current = false
    origin.current = { x: e.clientX, y: e.clientY }
    // The closure holds the handler from the render the press began in — a
    // hold is short enough that a fresher one changes nothing real.
    timer.current = setTimeout(() => {
      timer.current = undefined
      fired.current = true
      onLongPress()
    }, HOLD_MS)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!origin.current) return
    if (
      Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) >
      SLOP_PX
    ) {
      disarm()
    }
  }

  const onClickCapture = (e: React.MouseEvent) => {
    if (!fired.current) return
    fired.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: disarm,
    onPointerCancel: disarm,
    onPointerLeave: disarm,
    onClickCapture,
    onContextMenu,
  }
}

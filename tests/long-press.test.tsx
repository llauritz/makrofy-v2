// @vitest-environment jsdom
// Seam: the useLongPress hook's observable contract (#73) — hold-to-fire
// through pointer events, exercised via a real button so the tests survive
// any internal restructuring of timers or state.
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useLongPress } from "@/lib/useLongPress"

function Harness({
  onLongPress,
  onClick,
}: {
  onLongPress: () => void
  onClick: () => void
}) {
  const longPress = useLongPress(onLongPress)
  return (
    <button type="button" onClick={onClick} {...longPress}>
      hold me
    </button>
  )
}

function setup() {
  const onLongPress = vi.fn()
  const onClick = vi.fn()
  render(<Harness onLongPress={onLongPress} onClick={onClick} />)
  return { button: screen.getByRole("button"), onLongPress, onClick }
}

const down = (el: Element, x = 50, y = 50) =>
  fireEvent.pointerDown(el, { clientX: x, clientY: y })
const move = (el: Element, x: number, y: number) =>
  fireEvent.pointerMove(el, { clientX: x, clientY: y })

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useLongPress", () => {
  it("fires once after the hold threshold", () => {
    const { button, onLongPress } = setup()
    down(button)
    vi.advanceTimersByTime(499)
    expect(onLongPress).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onLongPress).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it("aborts when the pointer wanders past the slop — a scroll, not a hold", () => {
    const { button, onLongPress } = setup()
    down(button, 50, 50)
    move(button, 50, 65)
    vi.advanceTimersByTime(1000)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it("tolerates finger jitter within the slop", () => {
    const { button, onLongPress } = setup()
    down(button, 50, 50)
    move(button, 53, 47)
    vi.advanceTimersByTime(500)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it("aborts on pointercancel", () => {
    const { button, onLongPress } = setup()
    down(button)
    fireEvent.pointerCancel(button)
    vi.advanceTimersByTime(1000)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it("aborts when the pointer leaves the element", () => {
    const { button, onLongPress } = setup()
    down(button)
    fireEvent.pointerLeave(button)
    vi.advanceTimersByTime(1000)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it("does not fire on a short tap — the click proceeds", () => {
    const { button, onLongPress, onClick } = setup()
    down(button)
    vi.advanceTimersByTime(200)
    fireEvent.pointerUp(button)
    fireEvent.click(button)
    vi.advanceTimersByTime(1000)
    expect(onLongPress).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("swallows the click that trails a fired long-press — once", () => {
    const { button, onLongPress, onClick } = setup()
    down(button)
    vi.advanceTimersByTime(500)
    expect(onLongPress).toHaveBeenCalledTimes(1)
    fireEvent.pointerUp(button)
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
    // The next ordinary tap is back to normal.
    down(button)
    vi.advanceTimersByTime(100)
    fireEvent.pointerUp(button)
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("prevents the browser context menu on the element", () => {
    const { button } = setup()
    // fireEvent returns false when a handler called preventDefault.
    expect(fireEvent.contextMenu(button)).toBe(false)
  })
})

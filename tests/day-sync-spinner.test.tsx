// @vitest-environment jsdom
// Seam: the faint "still updating" spinner under the log. Its contract is
// timing: never for a wait short enough to blink, gone the moment the Day is
// confirmed, and never spinning forever on a stuck connection.
import { act, cleanup, render } from "@testing-library/react"
import { MotionGlobalConfig } from "motion/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DaySyncSpinner } from "@/screens/main/DaySyncSpinner"

const spinner = () => document.querySelector("[data-sync-spinner]")

// Timing is the contract here, not the fade: exits complete at once so the
// DOM reflects the hidden state the moment it's decided.
beforeEach(() => {
  vi.useFakeTimers()
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  MotionGlobalConfig.skipAnimations = false
})

// The hide is decided on the fake clock; motion then unmounts the (instant)
// exit on its own frame loop, which runs on the real one.
async function exitSettled() {
  vi.useRealTimers()
  await vi.waitFor(() => expect(spinner()).toBeNull(), { timeout: 500 })
}

describe("DaySyncSpinner", () => {
  it("stays hidden for a quick confirmation", () => {
    const { rerender } = render(<DaySyncSpinner active />)
    act(() => vi.advanceTimersByTime(200))
    rerender(<DaySyncSpinner active={false} />)
    act(() => vi.advanceTimersByTime(1000))
    expect(spinner()).toBeNull()
  })

  it("appears once the wait outlasts the blink threshold", () => {
    render(<DaySyncSpinner active />)
    expect(spinner()).toBeNull()
    act(() => vi.advanceTimersByTime(300))
    expect(spinner()).not.toBeNull()
  })

  it("hides the moment the Day is confirmed", async () => {
    const { rerender } = render(<DaySyncSpinner active />)
    act(() => vi.advanceTimersByTime(300))
    expect(spinner()).not.toBeNull()
    rerender(<DaySyncSpinner active={false} />)
    await exitSettled()
  })

  it("gives up on a connection that stays stuck", async () => {
    render(<DaySyncSpinner active />)
    act(() => vi.advanceTimersByTime(300))
    expect(spinner()).not.toBeNull()
    act(() => vi.advanceTimersByTime(10_000))
    await exitSettled()
  })
})

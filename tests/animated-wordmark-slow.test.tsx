// @vitest-environment jsdom
// Seam: AnimatedWordmark when the player is slow or fails (#79, Nov 2026).
// The slot stays empty while the player may still arrive; past the wait, or
// on a failed load, the static text shows, and a player arriving after that
// takes over at the intro's settled end instead of replaying the food shapes.
// The player module is stubbed so each test controls when it resolves.
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LanguageProvider } from "@/components/language-provider"

const anim = {
  goToAndPlay: vi.fn(),
  goToAndStop: vi.fn(),
  destroy: vi.fn(),
  setSubframe: vi.fn(),
}
const loadAnimation = vi.fn(() => anim)
let settle: { resolve: (p: unknown) => void; reject: (e: unknown) => void }

vi.mock("@/screens/main/wordmark-player", () => ({
  loadedWordmarkPlayer: () => null,
  loadWordmarkPlayer: () =>
    new Promise((resolve, reject) => {
      settle = { resolve, reject }
    }),
}))

import { AnimatedWordmark } from "@/screens/main/AnimatedWordmark"

const player = { lottie: { loadAnimation }, animationData: {} }

beforeEach(() => {
  vi.useFakeTimers()
  loadAnimation.mockClear()
  Object.values(anim).forEach((f) => f.mockClear())
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup() {
  render(
    <LanguageProvider>
      <AnimatedWordmark />
    </LanguageProvider>,
  )
}

describe("AnimatedWordmark with a slow player", () => {
  it("plays the intro into the empty slot when the player arrives in time", async () => {
    setup()
    expect(screen.getByText("Yaffle").style.visibility).toBe("hidden")
    await act(async () => {
      vi.advanceTimersByTime(500)
      settle.resolve(player)
    })
    expect(loadAnimation).toHaveBeenCalledWith(
      expect.objectContaining({ autoplay: true }),
    )
    expect(anim.goToAndStop).not.toHaveBeenCalled()
  })

  it("shows the text once the wait runs out, then takes over without an intro", async () => {
    setup()
    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })
    expect(screen.getByText("Yaffle").style.visibility).toBe("")
    await act(async () => {
      settle.resolve(player)
    })
    expect(loadAnimation).toHaveBeenCalledWith(
      expect.objectContaining({ autoplay: false }),
    )
    expect(anim.goToAndStop).toHaveBeenCalledWith(25, true)
  })

  it("shows the text when the player fails to load", async () => {
    setup()
    await act(async () => {
      settle.reject(new Error("offline"))
    })
    expect(screen.getByText("Yaffle").style.visibility).toBe("")
    expect(loadAnimation).not.toHaveBeenCalled()
  })
})

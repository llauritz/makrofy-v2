// @vitest-environment jsdom
// Seam: AnimatedWordmark's observable contract (#79) — the static Fraunces
// wordmark paints synchronously (the boot mirror's instant first frame must
// never wait on the player), the Lottie swaps in and plays the intro once
// loaded, a tap replays from the start, and reduced motion or a failed load
// keep the static text. The player module and animation JSON are mocked, so
// these tests pin the component's behavior, not lottie-web's rendering.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LanguageProvider } from "@/components/language-provider"
import { AnimatedWordmark } from "@/screens/main/AnimatedWordmark"

const loadAnimation = vi.fn()
const goToAndPlay = vi.fn()
const destroy = vi.fn()
const setSubframe = vi.fn()

vi.mock("lottie-web/build/player/lottie_light", () => ({
  default: { loadAnimation: (...args: unknown[]) => loadAnimation(...args) },
}))

let reducedMotion = false

beforeEach(() => {
  reducedMotion = false
  loadAnimation.mockReset()
  loadAnimation.mockReturnValue({ goToAndPlay, destroy, setSubframe })
  goToAndPlay.mockReset()
  destroy.mockReset()
  setSubframe.mockReset()
  // jsdom lacks matchMedia; the component probes prefers-reduced-motion.
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") && reducedMotion,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
})

function setup() {
  render(
    <LanguageProvider>
      <AnimatedWordmark />
    </LanguageProvider>,
  )
}

describe("AnimatedWordmark", () => {
  it("paints the static wordmark synchronously", () => {
    setup()
    expect(screen.getByText("Yaffle")).toBeTruthy()
  })

  it("swaps to the player and plays the intro once loaded", async () => {
    setup()
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledTimes(1))
    const config = loadAnimation.mock.calls[0][0] as {
      loop: boolean
      autoplay: boolean
      renderer: string
      animationData: unknown
      initialSegment: [number, number]
    }
    expect(config.loop).toBe(false)
    expect(config.autoplay).toBe(true)
    expect(config.renderer).toBe("svg")
    // The real export rides along: the 1000x200 wordmark comp.
    expect(config.animationData).toMatchObject({ w: 1000, h: 200 })
    // The intro's last entrance keyframe sits at frame 25 — the segment must
    // reach past it, or the letters freeze mid-entrance (#79 review round).
    expect(config.initialSegment[1]).toBeGreaterThan(25)
    // Whole-frame rendering: the comp is authored at 12 fps, and subframe
    // interpolation would smooth away that cadence.
    expect(setSubframe).toHaveBeenCalledWith(false)
    // The static text yields to the animation.
    await waitFor(() => expect(screen.queryByText("Yaffle")).toBeNull())
  })

  it("replays from the start on tap", async () => {
    setup()
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("button", { name: "Yaffle" }))
    expect(goToAndPlay).toHaveBeenCalledWith(0, true)
  })

  it("keeps the static wordmark under reduced motion", async () => {
    reducedMotion = true
    setup()
    // Give a pending dynamic import a tick to (wrongly) land.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(loadAnimation).not.toHaveBeenCalled()
    expect(screen.getByText("Yaffle")).toBeTruthy()
    // With no player to replay, no button reaches the accessibility tree.
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("destroys the player on unmount", async () => {
    setup()
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledTimes(1))
    cleanup()
    expect(destroy).toHaveBeenCalled()
  })
})

// Relaunches that never remount React — a bfcache restore, or the installed
// PWA resurfacing from the app switcher — must replay the intro rather than
// greet with the previous run's frozen end frame.
describe("AnimatedWordmark relaunch", () => {
  function firePageShow(persisted: boolean) {
    const event = new Event("pageshow")
    Object.defineProperty(event, "persisted", { value: persisted })
    window.dispatchEvent(event)
  }

  function setVisibility(state: "hidden" | "visible") {
    Object.defineProperty(document, "visibilityState", {
      value: state,
      configurable: true,
    })
    document.dispatchEvent(new Event("visibilitychange"))
  }

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    })
  })

  it("replays on a bfcache restore, not on a first-load pageshow", async () => {
    setup()
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledTimes(1))
    firePageShow(false)
    expect(goToAndPlay).not.toHaveBeenCalled()
    firePageShow(true)
    expect(goToAndPlay).toHaveBeenCalledWith(0, true)
  })

  it("replays when the app resurfaces after a long background stretch", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000)
    setup()
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledTimes(1))
    setVisibility("hidden")
    now.mockReturnValue(1_000_000 + 11_000)
    setVisibility("visible")
    expect(goToAndPlay).toHaveBeenCalledWith(0, true)
  })

  it("stays put after a brief hop to another app", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000)
    setup()
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledTimes(1))
    setVisibility("hidden")
    now.mockReturnValue(1_000_000 + 5_000)
    setVisibility("visible")
    expect(goToAndPlay).not.toHaveBeenCalled()
  })

  it("ignores relaunch signals once unmounted", async () => {
    setup()
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledTimes(1))
    cleanup()
    firePageShow(true)
    expect(goToAndPlay).not.toHaveBeenCalled()
  })

  // The bfcache freezes the DOM as the pagehide handlers leave it, and the
  // restored page paints that DOM before pageshow runs — so the wordmark
  // hides itself into the snapshot and the restore never flashes the
  // previous run's end frame.
  it("hides into the bfcache snapshot and unhides on restore", async () => {
    setup()
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledTimes(1))
    const container = screen
      .getByRole("button", { name: "Yaffle" })
      .querySelector("div")!
    const event = new Event("pagehide")
    Object.defineProperty(event, "persisted", { value: true })
    window.dispatchEvent(event)
    expect(container.style.visibility).toBe("hidden")
    firePageShow(true)
    expect(container.style.visibility).toBe("")
    expect(goToAndPlay).toHaveBeenCalledWith(0, true)
  })

  it("does not bother hiding when the page is dying for real", async () => {
    setup()
    await waitFor(() => expect(loadAnimation).toHaveBeenCalledTimes(1))
    const container = screen
      .getByRole("button", { name: "Yaffle" })
      .querySelector("div")!
    const event = new Event("pagehide")
    Object.defineProperty(event, "persisted", { value: false })
    window.dispatchEvent(event)
    expect(container.style.visibility).toBe("")
  })
})

// @vitest-environment jsdom
// Seam: ThemeProvider and wallpaper colours on Android. Warm Market is
// untouched wherever there is no palette or the user picks Yaffle's own
// colours; otherwise the wallpaper's tokens are on <html> from the first
// render and the system bars follow.
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  type ColorSource,
  ThemeProvider,
  useTheme,
} from "@/components/theme-provider"
import { materialYouTokens } from "@/lib/material-you"

import { BLUE } from "./material-you-palette"

describe("ThemeProvider", () => {
  let api: ReturnType<typeof useTheme> | null = null
  function Probe() {
    api = useTheme()
    return null
  }

  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    delete window.__yaffleMaterialYou
    document.documentElement.removeAttribute("style")
    api = null
  })

  const background = () =>
    document.documentElement.style.getPropertyValue("--background")
  const themeColor = () =>
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content

  it("leaves Warm Market alone on the web", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )
    expect(api!.wallpaperColorsAvailable).toBe(false)
    expect(background()).toBe("")
    expect(themeColor()).toBe("#f6f1e6")
  })

  it("paints the wallpaper's colours from the first render when the shell provides them", () => {
    window.__yaffleMaterialYou = BLUE
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )
    const expected = materialYouTokens(BLUE, "light").background
    expect(api!.wallpaperColorsAvailable).toBe(true)
    expect(api!.colorSource).toBe("wallpaper")
    expect(background()).toBe(expected)
    expect(themeColor()).toBe(expected)
  })

  it("goes back to Yaffle's colours when the user picks them, and remembers it", () => {
    window.__yaffleMaterialYou = BLUE
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )
    act(() => api!.setColorSource("yaffle" satisfies ColorSource))
    expect(background()).toBe("")
    expect(themeColor()).toBe("#f6f1e6")
    expect(localStorage.getItem("color-source")).toBe("yaffle")
  })
})

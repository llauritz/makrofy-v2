import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"

import { describe, expect, it } from "vitest"

// iOS Safari zooms in on a focused text field under 16px. index.html stops it
// with maximum-scale=1 on iOS only (Android honours maximum-scale for pinch
// zoom too, so it must keep the plain viewport). This runs the inline script
// against fake devices and reads back the viewport it leaves.

const html = readFileSync(join(__dirname, "..", "index.html"), "utf8")
const VIEWPORT = "width=device-width, initial-scale=1.0, viewport-fit=cover"

const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1])
  .find((s) => s.includes("maximum-scale=1"))

function viewportOn(navigator: {
  userAgent: string
  platform: string
  maxTouchPoints: number
}): string {
  if (!script) throw new Error("index.html has no focus zoom script")
  let content = VIEWPORT
  const meta = {
    getAttribute: () => content,
    setAttribute: (_: string, v: string) => {
      content = v
    },
  }
  runInNewContext(script, {
    navigator,
    document: {
      querySelector: (sel: string) =>
        sel === 'meta[name="viewport"]' ? meta : null,
    },
  })
  return content
}

describe("index.html iOS focus zoom", () => {
  it("runs after the viewport meta it edits", () => {
    expect(html).toContain(`<meta name="viewport" content="${VIEWPORT}" />`)
    expect(html.indexOf('name="viewport"')).toBeLessThan(
      html.indexOf("maximum-scale=1")
    )
  })

  it("caps the scale on iPhone and iPad", () => {
    for (const nav of [
      {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
      },
      {
        // iPadOS asks for desktop sites and reports itself as a Mac.
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5,
      },
    ]) {
      expect(viewportOn(nav)).toBe(`${VIEWPORT}, maximum-scale=1`)
    }
  })

  it("leaves Android and desktop with pinch zoom", () => {
    for (const nav of [
      {
        userAgent:
          "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
      },
      {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 0,
      },
    ]) {
      expect(viewportOn(nav)).toBe(VIEWPORT)
    }
  })
})

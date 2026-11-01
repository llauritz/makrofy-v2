// Seam: wallpaper colours on Android (src/lib/material-you.ts). The shell hands
// over Android's tonal ramps; every Yaffle token keeps its Warm Market
// lightness and takes its hue from the wallpaper.
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  colorAtTone,
  hexToLab,
  isMaterialYouPalette,
  labToHex,
  MATERIAL_YOU_TOKENS,
  materialYouTokens,
} from "@/lib/material-you"

import { BLUE } from "./material-you-palette"

function hue(hex: string): number {
  const { a, b } = hexToLab(hex)
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
}

describe("colour maths", () => {
  it("round-trips hex through Lab", () => {
    for (const hex of ["#f6f1e6", "#17110c", "#2f6bc4", "#000000", "#ffffff"]) {
      expect(labToHex(hexToLab(hex))).toBe(hex)
    }
  })

  it("picks a colour at the asked-for tone between two stops", () => {
    for (const tone of [6, 14, 47.5, 93.6, 98.4]) {
      expect(hexToLab(colorAtTone(BLUE.neutral2, tone)).l).toBeCloseTo(tone, 0)
    }
  })
})

describe("token mapping", () => {
  it("keeps the Warm Market values in step with index.css", () => {
    const css = readFileSync(join(__dirname, "..", "src/index.css"), "utf8")
    const block = (selector: string) => {
      const start = css.indexOf(`${selector} {`)
      return css.slice(start, css.indexOf("}", start))
    }
    const light = block(":root")
    const dark = block(".dark")
    for (const [name, spec] of Object.entries(MATERIAL_YOU_TOKENS)) {
      expect(light, `--${name} (light)`).toContain(`--${name}: ${spec.light};`)
      expect(dark, `--${name} (dark)`).toContain(`--${name}: ${spec.dark};`)
    }
  })

  it("keeps each surface's lightness and takes the wallpaper's hue", () => {
    for (const mode of ["light", "dark"] as const) {
      const tokens = materialYouTokens(BLUE, mode)
      for (const name of [
        "background",
        "card",
        "foreground",
        "border",
        "muted",
      ]) {
        const warm = MATERIAL_YOU_TOKENS[name][mode]
        expect(hexToLab(tokens[name]).l, `${name} ${mode}`).toBeCloseTo(
          hexToLab(warm).l,
          0
        )
      }
      for (const name of ["background", "muted", "border"]) {
        expect(Math.abs(hue(tokens[name]) - 280), name).toBeLessThan(15)
      }
    }
  })

  it("makes primary Material's accent role", () => {
    expect(hexToLab(materialYouTokens(BLUE, "light").primary).l).toBeCloseTo(
      40,
      0
    )
    expect(hexToLab(materialYouTokens(BLUE, "dark").primary).l).toBeCloseTo(
      80,
      0
    )
  })

  it("rejects a malformed palette", () => {
    expect(isMaterialYouPalette(BLUE)).toBe(true)
    expect(isMaterialYouPalette(null)).toBe(false)
    expect(isMaterialYouPalette({ ...BLUE, accent1: ["red"] })).toBe(false)
    expect(isMaterialYouPalette({ neutral1: BLUE.neutral1 })).toBe(false)
  })
})

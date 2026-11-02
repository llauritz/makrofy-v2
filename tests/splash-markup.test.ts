import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { LOGO_PATH, LOGO_VIEWBOX } from "@/components/ui/yaffle-logo"
import { BOOT_MIRROR_KEY } from "@/data/boot-mirror"
import { FONTS } from "@/lib/preload"

// Seam: the launch splash exists twice — as static markup in index.html,
// which paints before any script has loaded, and as App's Splash for the
// times the app splashes on its own. index.html can't import anything, so
// this pins its copies to the sources: the logo, and the boot mirror key that
// hides the static splash on a returning launch (a renamed key would bring the
// splash back over every returning launch).

const html = readFileSync(join(__dirname, "..", "index.html"), "utf8")

describe("index.html launch splash", () => {
  it("draws the same logo as YaffleLogo", () => {
    expect(html).toContain(`viewBox="${LOGO_VIEWBOX}"`)
    expect(html).toContain(`d="${LOGO_PATH}"`)
  })

  it("hides itself under the boot mirror's real key", () => {
    expect(html).toContain(`localStorage.getItem("${BOOT_MIRROR_KEY}")`)
  })

  it("warms up every font face the welcome screen waits for", () => {
    // FONTS entries look like '700 16px "Public Sans Variable"'.
    for (const font of FONTS) {
      // Variable fonts: one file per family, so any weight of it will do.
      const name = font.slice(font.indexOf('"') + 1, -1)
      expect(html).toContain(`font-family:'${name}'`)
    }
  })
})

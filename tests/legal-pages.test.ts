import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { LOGO_PATH, LOGO_VIEWBOX } from "@/components/ui/yaffle-logo"

// Seam: the pricing and legal pages are static HTML outside the React app
// (Paddle's domain review needs them to load without JavaScript), so each
// carries its own inline copy of the logo. This pins those copies to
// YaffleLogo, as tests/splash-markup.test.ts does for index.html.

const PAGES = ["terms", "privacy", "pricing", "refunds"]

describe.each(PAGES)("public/%s.html", (page) => {
  const html = readFileSync(
    join(__dirname, "..", "public", `${page}.html`),
    "utf8"
  )

  it("draws the same logo as YaffleLogo", () => {
    expect(html).toContain(`viewBox="${LOGO_VIEWBOX}"`)
    expect(html).toContain(`d="${LOGO_PATH}"`)
  })
})

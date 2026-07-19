import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// Seam: the dark-theme ink flip (#79) lives in two files that must agree —
// the Lottie export's letterform fill and the index.css attribute selector
// that recolors it. lottie-web's SVG renderer writes solid fills as floored
// rgb() attributes, so the selector must equal floor(component * 255) of an
// ink actually present in the export. A re-export with a shifted ink would
// silently break dark mode; this pins the pair together.

const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8")

describe("wordmark dark-theme ink", () => {
  it("keeps the index.css selector in step with the export's ink", () => {
    const animation = JSON.parse(read("src/assets/yaffle-wordmark.json"))
    const inks = new Set<string>()
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (node && typeof node === "object") {
        const shape = node as { ty?: string; c?: { a?: number; k?: number[] } }
        if (shape.ty === "fl" && shape.c?.a === 0 && shape.c.k) {
          inks.add(
            `rgb(${shape.c.k.map((v) => Math.floor(v * 255)).join(",")})`,
          )
        }
        Object.values(node).forEach(walk)
      }
    }
    walk(animation)

    const selector = read("src/index.css").match(
      /\.wordmark-anim svg path\[fill="([^"]+)"\]/,
    )
    expect(selector).not.toBeNull()
    expect(inks).toContain(selector![1])
  })
})

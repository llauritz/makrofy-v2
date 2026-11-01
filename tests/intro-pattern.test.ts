// Seam: the intro's food pattern packer (src/screens/onboarding/pattern.ts).
// The owner's rules for the pattern (#35): mixed sizes, never overlapping,
// evenly spaced. Pinned on seeded layouts across phone-sized fields.
import { describe, expect, it } from "vitest"

import {
  geometryOf,
  packPattern,
  seededRandom,
  tooClose,
} from "@/screens/onboarding/pattern"

const ASPECTS = [1.081, 0.568, 0.571, 0.479, 1.102, 0.961]
const GAP = 12

describe("packPattern", () => {
  for (const [w, h, seed] of [
    [375, 780, 1],
    [390, 844, 2],
    [320, 568, 3],
  ] as const) {
    const tiles = packPattern(w, h, ASPECTS, {
      gap: GAP,
      random: seededRandom(seed),
    })
    const boxes = tiles.map(geometryOf)

    it(`fills a ${w}×${h} screen with mixed sizes`, () => {
      expect(tiles.length).toBeGreaterThan(40)
      const sizes = tiles.map((t) => Math.max(t.w, t.h))
      expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThan(2.5)
      expect(new Set(tiles.map((t) => t.kind)).size).toBe(ASPECTS.length)
    })

    it(`never lets two tiles come closer than the gap (${w}×${h})`, () => {
      // A hair under the gap: binary search settles just inside it.
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++)
          expect(tooClose(boxes[i], boxes[j], GAP - 0.01)).toBe(false)
    })

    it(`keeps every tile near a neighbour, so the spacing reads even (${w}×${h})`, () => {
      // Grow-to-fit: each tile either touched a neighbour at one gap or hit its
      // size cap. Either way something sits within a few gaps of it.
      for (let i = 0; i < boxes.length; i++) {
        const near = boxes.some(
          (other, j) => j !== i && tooClose(boxes[i], other, GAP * 3)
        )
        expect(near).toBe(true)
      }
    })

    it(`keeps tiles within reach of the screen (${w}×${h})`, () => {
      for (const t of tiles) {
        expect(t.x).toBeGreaterThanOrEqual(-30)
        expect(t.x).toBeLessThanOrEqual(w + 30)
        expect(t.y).toBeGreaterThanOrEqual(-30)
        expect(t.y).toBeLessThanOrEqual(h + 30)
      }
    })
  }

  it("is deterministic for a given seed", () => {
    const a = packPattern(375, 780, ASPECTS, { random: seededRandom(9) })
    const b = packPattern(375, 780, ASPECTS, { random: seededRandom(9) })
    expect(a).toEqual(b)
  })
})

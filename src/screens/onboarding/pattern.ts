// The intro's food pattern (#35): the wordmark animation's six illustrations
// scattered over the whole screen at mixed sizes and tilts, never overlapping,
// with an even gap between neighbours. Pure and seedable so the no-overlap
// rule is testable without a browser.
//
// Placement is grow-to-fit: each candidate spot (random centre, tilt, food)
// is kept only if its smallest size fits, then grows until it sits exactly one
// gap from its nearest neighbour, or reaches its own random size cap. Every
// tile therefore ends up one gap from something, which is what makes the
// spacing read as even while the sizes vary. Collisions are tested on the
// tiles' rotated bounding boxes (separating axis test).

export interface Tile {
  /** Centre, in px from the top-left of the field. */
  x: number
  y: number
  /** Unrotated box size, in px. */
  w: number
  h: number
  /** Tilt, in degrees. */
  rotate: number
  /** Index into the aspects the pattern was packed with. */
  kind: number
}

export interface PackOptions {
  /** The smallest a tile's longer side may be, in px. Smaller holes stay empty. */
  min?: number
  /** The largest a tile's longer side may grow, in px. */
  max?: number
  /** The clear space between neighbouring boxes, in px. */
  gap?: number
  /** Candidate spots tried; more fills tighter but costs time. */
  tries?: number
  /** Max tilt either way, in degrees. */
  tilt?: number
  /** A [0, 1) source; inject a seeded one for deterministic tests. */
  random?: () => number
}

/** A small seeded generator (LCG) for tests and stable screenshots. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

type Box = Tile & { corners: number[]; radius: number }

function withGeometry(t: Tile): Box {
  const r = (t.rotate * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const hw = t.w / 2
  const hh = t.h / 2
  const corners: number[] = []
  for (const [dx, dy] of [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]) {
    corners.push(t.x + dx * c - dy * s, t.y + dx * s + dy * c)
  }
  return { ...t, corners, radius: Math.hypot(hw, hh) }
}

function projectedRange(corners: number[], ax: number, ay: number) {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < 8; i += 2) {
    const p = corners[i] * ax + corners[i + 1] * ay
    if (p < lo) lo = p
    if (p > hi) hi = p
  }
  return [lo, hi] as const
}

/** Whether two boxes come closer than `gap` (or overlap). */
export function tooClose(a: Box, b: Box, gap: number): boolean {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const reach = a.radius + b.radius + gap
  if (dx * dx + dy * dy >= reach * reach) return false
  for (const deg of [a.rotate, a.rotate + 90, b.rotate, b.rotate + 90]) {
    const r = (deg * Math.PI) / 180
    const ax = Math.cos(r)
    const ay = Math.sin(r)
    const [aLo, aHi] = projectedRange(a.corners, ax, ay)
    const [bLo, bHi] = projectedRange(b.corners, ax, ay)
    if (aHi + gap <= bLo || bHi + gap <= aLo) return false
  }
  return true
}

/**
 * Pack tiles over a `width` × `height` field. `aspects` are each food's
 * width ÷ height; tiles may hang past the edges so the pattern reads as
 * continuing beyond the screen.
 */
export function packPattern(
  width: number,
  height: number,
  aspects: readonly number[],
  {
    min = 26,
    max = 120,
    gap = 12,
    tries = 2500,
    tilt = 45,
    random = Math.random,
  }: PackOptions = {}
): Tile[] {
  const placed: Box[] = []
  const bleed = 30

  // `size` is the longer side; the shorter follows from the food's aspect.
  const box = (
    x: number,
    y: number,
    rotate: number,
    kind: number,
    size: number
  ) => {
    const a = aspects[kind]
    const h = a < 1 ? size : size / a
    return withGeometry({ x, y, w: h * a, h, rotate, kind })
  }
  const fits = (b: Box) => placed.every((p) => !tooClose(p, b, gap))

  for (let i = 0; i < tries; i++) {
    const kind = Math.floor(random() * aspects.length)
    const x = -bleed + random() * (width + bleed * 2)
    const y = -bleed + random() * (height + bleed * 2)
    const rotate = (random() * 2 - 1) * tilt
    // Skewed toward the small end, so a few big tiles anchor many small ones.
    const cap = min + (max - min) * Math.pow(random(), 0.8)

    if (!fits(box(x, y, rotate, kind, min))) continue
    let lo = min
    let hi = cap
    if (fits(box(x, y, rotate, kind, hi))) lo = hi
    else
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2
        if (fits(box(x, y, rotate, kind, mid))) lo = mid
        else hi = mid
      }
    placed.push(box(x, y, rotate, kind, lo))
  }

  return placed.map(({ x, y, w, h, rotate, kind }) => ({
    x,
    y,
    w,
    h,
    rotate,
    kind,
  }))
}

/** Exposed for tests: a tile with its collision geometry. */
export const geometryOf = withGeometry

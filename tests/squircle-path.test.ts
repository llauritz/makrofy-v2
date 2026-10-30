import { getSvgPath } from "figma-squircle"
import { describe, expect, it } from "vitest"

import { squircleOutline } from "@/lib/squircle-path"

type Pt = [number, number]

const uniform = (r: number) => ({ tl: r, tr: r, br: r, bl: r })

/** Every end and control point of a path, made absolute. */
function keyPoints(d: string) {
  const tokens = d.match(/[A-Za-z]|-?[\d.]+(?:e-?\d+)?/g) ?? []
  const points: Pt[] = []
  let at: Pt = [0, 0]
  let cmd = ""
  for (let i = 0; i < tokens.length;) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++]
    if (/z/i.test(cmd)) continue
    const rel = cmd === cmd.toLowerCase()
    const read = (): Pt => {
      const p: Pt = [+tokens[i++], +tokens[i++]]
      return rel ? [at[0] + p[0], at[1] + p[1]] : p
    }
    const upper = cmd.toUpperCase()
    if (upper === "A") i += 5
    const pts = upper === "C" ? [read(), read(), read()] : [read()]
    points.push(...pts)
    at = pts[pts.length - 1]
  }
  return points
}

/** Points along an absolute M/L/C/A path, as `squircleOutline` writes it. */
function trace(d: string) {
  const tokens = d.match(/[A-Za-z]|-?[\d.]+(?:e-?\d+)?/g) ?? []
  const out: Pt[] = []
  let at: Pt = [0, 0]
  let cmd = ""
  const read = (i: number): Pt => [+tokens[i], +tokens[i + 1]]
  for (let i = 0; i < tokens.length;) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++]
    if (cmd === "Z") break
    if (cmd === "M" || cmd === "L") {
      at = read(i)
      i += 2
      out.push(at)
    } else if (cmd === "C") {
      const [p1, p2, p3] = [read(i), read(i + 2), read(i + 4)]
      i += 6
      for (let t = 0; t <= 1; t += 0.01) {
        const u = 1 - t
        out.push([
          u ** 3 * at[0] +
            3 * u * u * t * p1[0] +
            3 * u * t * t * p2[0] +
            t ** 3 * p3[0],
          u ** 3 * at[1] +
            3 * u * u * t * p1[1] +
            3 * u * t * t * p2[1] +
            t ** 3 * p3[1],
        ])
      }
      at = p3
    } else if (cmd === "A") {
      const r = +tokens[i]
      const end = read(i + 5)
      i += 7
      // A clockwise minor arc: its centre is left of the chord, r away.
      const [dx, dy] = [end[0] - at[0], end[1] - at[1]]
      const half = Math.hypot(dx, dy) / 2
      if (half > 1e-9) {
        const k = Math.sqrt(Math.max(0, r * r - half * half))
        const c: Pt = [
          (at[0] + end[0]) / 2 - (k * dy) / (2 * half),
          (at[1] + end[1]) / 2 + (k * dx) / (2 * half),
        ]
        const a0 = Math.atan2(at[1] - c[1], at[0] - c[0])
        let sweep = Math.atan2(end[1] - c[1], end[0] - c[0]) - a0
        if (sweep < 0) sweep += 2 * Math.PI
        for (let t = 0; t <= 1; t += 0.01)
          out.push([
            c[0] + r * Math.cos(a0 + sweep * t),
            c[1] + r * Math.sin(a0 + sweep * t),
          ])
      }
      at = end
    }
  }
  return out
}

/** Signed distance from a point to the plain rounded rectangle's edge. */
function fromPlain([x, y]: Pt, w: number, h: number, r: number) {
  const qx = Math.abs(x - w / 2) - (w / 2 - r)
  const qy = Math.abs(y - h / 2) - (h / 2 - r)
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    r
  )
}

const near = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3

describe("squircleOutline", () => {
  it.each([
    [358, 119, 30.8],
    [366, 149, 28],
    [173, 101, 25.2],
  ])(
    "is Figma's own path where every edge has room (%i×%i, r %d)",
    (width, height, r) => {
      const ours = keyPoints(
        squircleOutline({ width, height, radii: uniform(r), smoothing: 0.6 })
      )
      const figma = keyPoints(
        getSvgPath({ width, height, cornerRadius: r, cornerSmoothing: 0.6 })
      )
      expect(figma).toHaveLength(4 * 8)
      for (const p of figma) expect(ours.some((q) => near(p, q))).toBe(true)
      for (const p of ours) expect(figma.some((q) => near(p, q))).toBe(true)
    }
  )

  it("keeps a stadium's ends perfectly round and smooths into its sides", () => {
    // The day strip's selection: 44 wide, so its ends are whole half-circles
    // and only its 15px of straight side can be eased into.
    const [w, h, r] = [44, 59, 22]
    const points = trace(
      squircleOutline({
        width: w,
        height: h,
        radii: uniform(r),
        smoothing: 0.6,
      })
    )
    // Above and below where the run-ins join (27° round from the sides), the
    // outline is the plain stadium to the floating-point digit.
    const join = r - r * Math.sin((Math.PI / 4) * 0.6)
    const caps = points.filter(
      ([, y]) => y < join - 0.01 || y > h - join + 0.01
    )
    expect(caps.length).toBeGreaterThan(50)
    for (const p of caps)
      expect(Math.abs(fromPlain(p, w, h, r))).toBeLessThan(1e-3)
    // The sides do ease in: inside the plain stadium, measurably.
    const sides = points.filter(([, y]) => y > join && y < h - join)
    expect(
      Math.max(...sides.map((p) => -fromPlain(p, w, h, r)))
    ).toBeGreaterThan(0.1)
  })

  it("budgets each edge on its own length, not the shorter side's", () => {
    // An entry row: 60 tall, so its ends have only 30 - 25.2 of straight to
    // ease out of — but the long edges still take the full 1.6 × r run-in.
    const [w, h, r] = [358, 60, 25.2]
    const points = keyPoints(
      squircleOutline({
        width: w,
        height: h,
        radii: uniform(r),
        smoothing: 0.6,
      })
    )
    const start = 1.6 * r
    expect(points.some((p) => near(p, [start, 0]))).toBe(true)
    expect(points.some((p) => near(p, [w - start, h]))).toBe(true)
    // The short edges' run-ins are shortened to meet at the middle.
    expect(points.some((p) => near(p, [0, h / 2]))).toBe(true)
    expect(points.some((p) => near(p, [w, h / 2]))).toBe(true)
  })

  it("leaves a zero-radius corner square", () => {
    const d = squircleOutline({
      width: 390,
      height: 600,
      radii: { tl: 30.8, tr: 30.8, br: 0, bl: 0 },
      smoothing: 0.6,
    })
    const points = keyPoints(d)
    expect(points.some((p) => near(p, [390, 600]))).toBe(true)
    expect(points.some((p) => near(p, [0, 600]))).toBe(true)
  })
})

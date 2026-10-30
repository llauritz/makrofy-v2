// The squircle outline every rounded surface clips to: a rounded rectangle
// whose corners ease out of the straight edges instead of meeting a circular
// arc head-on — Figma's "corner smoothing".
//
// Each corner is a circular arc of the requested radius with a cubic run-in
// on either side. A run-in starts `(1 + smoothing) × radius` from the corner
// and takes over `45° × smoothing` of the arc, so it needs straight edge to
// start from. figma-squircle budgets that against the box's shorter side for
// all four edges at once, which leaves a stadium — no straight end at all —
// with no smoothing on its long sides either. Here each side of each corner
// is budgeted against its own edge: an edge with straight length gets the
// full run-in, shortened to fit if it must, and an edge with none meets the
// plain arc. A stadium keeps its ends perfectly round and still eases into
// its sides. Where every edge has room the path is Figma's, point for point.

type Pt = readonly [number, number]

export type Radii = { tl: number; tr: number; br: number; bl: number }

/**
 * One side of a corner, in that edge's frame — `along` the edge away from the
 * corner, then `off` it into the shape — from where it leaves the edge to
 * where it joins the arc. `null` where the edge has no straight length to
 * leave from, so the arc runs all the way to it.
 */
function runIn(r: number, budget: number, smoothing: number) {
  if (smoothing <= 0 || budget - r <= 1e-6) return null
  // The share of the arc the run-in replaces stays whole however little edge
  // there is; only its length is shortened to fit.
  const angle = (Math.PI / 4) * smoothing
  const start = Math.min((1 + smoothing) * r, budget)
  const join: Pt = [r - r * Math.sin(angle), r - r * Math.cos(angle)]
  // The last control point is where the arc's tangent at the join meets the
  // edge, so the curve meets the arc without a kink; the other two split the
  // remaining straight run 2:1, as Figma's do.
  const knee = join[0] + r * Math.tan(angle / 2) * Math.cos(angle)
  const third = (start - knee) / 3
  return [[start, 0], [start - 2 * third, 0], [knee, 0], join] as Pt[]
}

const num = (n: number) => +n.toFixed(4)
const pt = ([x, y]: Pt) => `${num(x)} ${num(y)}`

/** The SVG path `d` of a `width` × `height` squircle. */
export function squircleOutline({
  width: w,
  height: h,
  radii,
  smoothing,
}: {
  width: number
  height: number
  radii: Radii
  smoothing: number
}) {
  const cap = Math.min(w, h) / 2
  // Clockwise from the top edge. `back` points from the corner back along the
  // edge the path arrives on, `on` along the edge it leaves by — each is also
  // the other edge's inward direction.
  const corners = [
    { r: radii.tr, at: [w, 0], back: [-1, 0], on: [0, 1], arrive: w, leave: h },
    {
      r: radii.br,
      at: [w, h],
      back: [0, -1],
      on: [-1, 0],
      arrive: h,
      leave: w,
    },
    { r: radii.bl, at: [0, h], back: [1, 0], on: [0, -1], arrive: w, leave: h },
    { r: radii.tl, at: [0, 0], back: [0, 1], on: [1, 0], arrive: h, leave: w },
  ] as const
  const parts = corners.map(({ r: want, at, back, on, arrive, leave }) => {
    const r = Math.min(want, cap)
    if (r <= 0) return { d: `L ${pt(at)}`, last: at as Pt }
    const onArriving = ([along, off]: Pt): Pt => [
      at[0] + along * back[0] + off * on[0],
      at[1] + along * back[1] + off * on[1],
    ]
    const onLeaving = ([along, off]: Pt): Pt => [
      at[0] + along * on[0] + off * back[0],
      at[1] + along * on[1] + off * back[1],
    ]
    const into = runIn(r, arrive / 2, smoothing)
    const out = runIn(r, leave / 2, smoothing)
    // Without a run-in the arc starts or ends where it touches the edge.
    const a = (into ?? [[r, 0] as Pt]).map(onArriving)
    const b = (out ?? [[r, 0] as Pt]).map(onLeaving).reverse()
    let d = `L ${pt(a[0])}`
    if (into) d += ` C ${pt(a[1])} ${pt(a[2])} ${pt(a[3])}`
    d += ` A ${num(r)} ${num(r)} 0 0 1 ${pt(b[0])}`
    if (out) d += ` C ${pt(b[1])} ${pt(b[2])} ${pt(b[3])}`
    return { d, last: b[b.length - 1] }
  })
  return `M ${pt(parts[3].last)} ${parts.map((p) => p.d).join(" ")} Z`
}

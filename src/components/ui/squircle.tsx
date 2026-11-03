/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { flushSync } from "react-dom"
import { squircleOutline } from "@/lib/squircle-path"
import { cn } from "@/lib/utils"

// Squircle corners app-wide. The shape is clipped with an SVG `path()`
// computed from the measured box, not by `border-radius` — drop the
// `rounded-*` class at the call site and pass a `radius` token instead.
// Pills are the exception: `pill` keeps its `rounded-full`, which a smoothed
// stadium lies wholly inside, so any CSS outline (the AI-fill flag) still
// follows a round curve.
//
// Two things follow from clipping, both of which the call sites have to
// respect:
//   - An outer `box-shadow` is painted as part of the element, so the clip
//     erases it. A squircled card casts its shadow from a wrapper with
//     `drop-shadow-[...]` instead, which traces the clipped silhouette.
//   - A `border` or `ring` cannot be the outline. Both follow a circular
//     `border-radius`, and the smoothed curve starts bending earlier and runs
//     inside that circle all the way round, so the clip shaves the line
//     unevenly through every corner — up to 0.38px of a 1px border at `3xl`.
//     Pass `outline` instead: <Squircle> then strokes the same path it clips
//     to, and keeps a transparent border so the box measures as it did.
//
// Every shape is drawn by lib/squircle-path, rounded rectangles through
// `CORNER_SMOOTHING` and pills through `PILL_SMOOTHING`.

/**
 * How hard the corners are smoothed, for every squircle in the app: 0 is a
 * plain circular arc, 1 a full superellipse. Figma's own default is 0.6.
 *
 * Smoothing eases each corner out of its straight edges, so it needs
 * straight edge to work with: a side with less than `0.6 × radius` of it
 * per corner eases in over what it has, and a side with none — a stadium's
 * ends — stays a plain arc (lib/squircle-path).
 */
export const CORNER_SMOOTHING = 0.6

/**
 * The same for pills: how gently a stadium's straight sides ease into its
 * round ends, which stay whole half-circles at any value.
 */
export const PILL_SMOOTHING = 0.6

// Mirrors the `--radius-*` scale in index.css, in px (--radius: 0.875rem).
// The path takes numbers, so the scale has to exist here too — keep the
// two in step.
const BASE = 14
const RADIUS = {
  sm: BASE * 0.6,
  md: BASE * 0.8,
  lg: BASE,
  xl: BASE * 1.4,
  "2xl": BASE * 1.8,
  "3xl": BASE * 2.2,
  "4xl": BASE * 2.6,
} as const

export type SquircleRadius = keyof typeof RADIUS

const px = (radius: SquircleRadius | number) =>
  typeof radius === "number" ? radius : RADIUS[radius]

type Shape = {
  /** Ignored when `pill` is set — a stadium's radius is half its short side. */
  radius?: SquircleRadius | number
  /** `top` rounds the top two corners only, for a sheet sitting on the edge. */
  corners?: "all" | "top"
  /** A stadium: round ends, with the smoothing on its straight sides. */
  pill?: boolean
  /** Overrides `CORNER_SMOOTHING`, or `PILL_SMOOTHING` for a `pill`. */
  cornerSmoothing?: number
}

/**
 * The squircle path for a box of a known size. Use this directly when the
 * caller already measures the box (the day strip's travelling pill does), and
 * <Squircle> when it does not.
 */
export function squircleD({
  width,
  height,
  radius = "lg",
  corners = "all",
  pill = false,
  cornerSmoothing = pill ? PILL_SMOOTHING : CORNER_SMOOTHING,
  x = 0,
  y = 0,
}: Shape & { width: number; height: number; x?: number; y?: number }) {
  if (width <= 0 || height <= 0) return undefined
  const r = pill ? Math.min(width, height) / 2 : px(radius)
  const bottom = corners === "top" ? 0 : r
  return squircleOutline({
    width,
    height,
    radii: { tl: r, tr: r, br: bottom, bl: bottom },
    smoothing: cornerSmoothing,
    x,
    y,
  })
}

export function squirclePath(shape: Shape & { width: number; height: number }) {
  const d = squircleD(shape)
  return d && `path('${d}')`
}

/**
 * An element's border box and the width of its border, kept current.
 *
 * Read from computed style, which is fractional where `offsetWidth` rounds to
 * whole px, and which ignores transforms where `getBoundingClientRect` does
 * not — an entrance that starts scaled down cannot freeze a shrunken path.
 * The border is read rather than assumed because the browser snaps it to
 * whole device pixels, so a `border` class's 1px can come out thinner.
 * Measurement runs in a layout effect, so the shape is already right on the
 * first paint.
 */
function useBox<T extends HTMLElement>() {
  // A callback ref, not a ref object: the element has to be state for the
  // measuring effect to re-run when it arrives.
  const [el, setEl] = React.useState<T | null>(null)
  const [size, setSize] = React.useState({ w: 0, h: 0, border: 0 })

  React.useLayoutEffect(() => {
    if (!el) return
    // Box-sizing is border-box app-wide, so `width` is the border box.
    const measure = () => {
      const cs = getComputedStyle(el)
      setSize({
        w: parseFloat(cs.width) || 0,
        h: parseFloat(cs.height) || 0,
        border: parseFloat(cs.borderTopWidth) || 0,
      })
    }
    measure()
    // A resize is flushed synchronously: the observer fires after layout and
    // before paint, so the new path lands in the same frame as the new size.
    // Left to React's batching it would paint a frame late, and a box whose
    // width is animating (the header cloud pill) would show its far edge
    // sliced off by the previous frame's clip on the way out.
    const ro = new ResizeObserver(() => flushSync(measure))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])

  return [setEl, size] as const
}

/** How far a solid ring's box overhangs its shape — see Stroke. */
const RING_BLEED = 2

type StrokeProps = Shape & {
  dashed?: boolean
  strokeWidth?: number
  className?: string
}

/** How far past the ring a dashed line's SVG stroke runs, each side — see Stroke. */
const DASH_BLEED = 1

/**
 * The squircle of a `width` × `height` box, stroked so the line's outer edge
 * sits on the box's own clip.
 *
 * The line is never an SVG stroke on its own but a ring: a box clipped,
 * even-odd, to the squircle minus the same squircle inset by the line's width
 * (at that much less radius, so the two stay concentric). An <svg> is a
 * replaced element, and the browser snaps its box to whole device pixels
 * while the clip-path it sits under stays where layout put it — so wherever
 * a box lands on a fractional pixel (a centred pill, a 16.5px line-height
 * above it, a 150% display) the stroke slid against the clip and one side was
 * shaved: a solid 1px outline came out heavy on the top and left and faint at
 * the bottom, and a dashed one could lose its bottom edge altogether. The
 * ring is a plain box clipped by the same path maths as the surface itself,
 * so line and clip rasterize together and the outline is even on every side,
 * at any offset.
 *
 * A solid ring is filled with `currentColor`. A dashed one holds an SVG whose
 * dashes run along the middle of the ring at its width plus DASH_BLEED either
 * side: the ring decides where the line is and how thick, the SVG only where
 * each dash starts and stops, so its snapping can move a dash end by a
 * fraction of a pixel but can no longer move the line out of the clip.
 */
function Stroke({
  width,
  height,
  dashed = false,
  strokeWidth = 1,
  className,
  style,
  ...shape
}: StrokeProps & {
  width: number
  height: number
  style?: React.CSSProperties
}) {
  // The ring's box overhangs the shape by RING_BLEED on every side, with the
  // paths shifted in to match: a box's background is snapped to device pixels
  // while its clip-path is not, so a box exactly the shape's size could snap
  // inward and leave a sliver of the ring unpainted.
  const b = RING_BLEED
  const radius = px(shape.radius ?? "lg")
  const outer = squircleD({ ...shape, width, height, x: b, y: b })
  const inner = squircleD({
    ...shape,
    radius: radius - strokeWidth,
    width: width - 2 * strokeWidth,
    height: height - 2 * strokeWidth,
    x: b + strokeWidth,
    y: b + strokeWidth,
  })
  // A dashed line's dashes follow the ring's centre line: half a stroke in,
  // at half a stroke less radius.
  const inset = strokeWidth / 2
  const middle =
    dashed &&
    squircleD({
      ...shape,
      radius: radius - inset,
      width: width - strokeWidth,
      height: height - strokeWidth,
      x: b + inset,
      y: b + inset,
    })
  const ready = outer && inner && (!dashed || middle)
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute block",
        !dashed && "bg-current",
        className
      )}
      style={{
        top: (Number(style?.top) || 0) - b,
        left: (Number(style?.left) || 0) - b,
        width: width + 2 * b,
        height: height + 2 * b,
        clipPath: ready ? `path(evenodd, '${outer} ${inner}')` : undefined,
        visibility: ready ? undefined : "hidden",
      }}
    >
      {middle && (
        <svg className="absolute inset-0 block size-full overflow-visible">
          <path
            d={middle}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth + 2 * DASH_BLEED}
            strokeDasharray="4 3"
          />
        </svg>
      )}
    </span>
  )
}

/**
 * The squircle drawn as a stroke, standing on its own: it fills a `relative`
 * parent that has no border and measures itself, inheriting `currentColor`.
 * It costs no layout, which keeps sibling boxes identical where a border
 * would not — the day strip's chips rely on that. A <Squircle> that is itself
 * outlined takes `outline` instead.
 */
export function SquircleOutline({ className, ...props }: StrokeProps) {
  const [el, setEl] = React.useState<HTMLSpanElement | null>(null)
  const [size, setSize] = React.useState({ w: 0, h: 0 })

  React.useLayoutEffect(() => {
    if (!el) return
    // Computed style, like useBox: getBoundingClientRect includes transforms,
    // so a ring that mounts while its card is pressed (whileTap's scale-down)
    // would freeze the shrunken size, and a transform ends without a resize
    // to correct it — the ring then sat inside the card's edges.
    const measure = () => {
      const cs = getComputedStyle(el)
      setSize({ w: parseFloat(cs.width) || 0, h: parseFloat(cs.height) || 0 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])

  // A measuring frame filling the parent; the stroke sits in it at the
  // frame's measured size (a solid ring overhangs it — see Stroke).
  return (
    <span
      ref={setEl}
      aria-hidden
      className="pointer-events-none absolute inset-0 block"
    >
      <Stroke
        {...props}
        width={size.w}
        height={size.h}
        className={className}
        style={{ top: 0, left: 0, width: size.w, height: size.h }}
      />
    </span>
  )
}

type SquircleProps = Omit<React.ComponentPropsWithoutRef<"div">, "ref"> &
  Shape & {
    asChild?: boolean
    /**
     * Strokes the squircle's own path as its outline, in place of a `border`
     * class (see the top of this file). The colour is a `text-*` class on
     * `outlineClassName`, `text-border` by default.
     */
    outline?: "solid" | "dashed"
    outlineClassName?: string
  }

export function Squircle({
  radius = "lg",
  corners = "all",
  pill = false,
  cornerSmoothing = pill ? PILL_SMOOTHING : CORNER_SMOOTHING,
  outline,
  outlineClassName = "text-border",
  asChild,
  className,
  style,
  children,
  ...props
}: SquircleProps) {
  const shape = { radius, corners, pill, cornerSmoothing }
  const [setEl, size] = useBox<HTMLElement>()
  const clipPath = React.useMemo(
    () =>
      squirclePath({
        width: size.w,
        height: size.h,
        radius,
        corners,
        pill,
        cornerSmoothing,
      }),
    [size, radius, corners, pill, cornerSmoothing]
  )

  // The transparent border keeps the box the size its `border` class gave
  // it, and the stroke is drawn at that border's own width, over it: an
  // absolute child starts inside the border, so it is pulled back out by the
  // border's width and sized to the measured border box. A top-only sheet
  // has no bottom edge to draw, so its stroke runs one width past the
  // bottom, where the clip cuts it off.
  const strokeHeight = size.h + (corners === "top" ? size.border : 0)
  const stroke = outline && size.border > 0 && (
    <Stroke
      {...shape}
      dashed={outline === "dashed"}
      strokeWidth={size.border}
      width={size.w}
      height={strokeHeight}
      className={outlineClassName}
      style={{
        top: -size.border,
        left: -size.border,
        width: size.w,
        height: strokeHeight,
      }}
    />
  )
  const outlined = outline && "relative border border-transparent"

  // A local `asChild`: this only ever needs the ref, the clip, the class list
  // and the stroke on the child, never full prop merging, so it costs a
  // cloneElement rather than a Slot.
  if (asChild && React.isValidElement<Record<string, unknown>>(children)) {
    const child = children.props
    const merged = {
      ref: setEl,
      className: cn(outlined, className, child.className as string),
      style: { ...style, ...(child.style as React.CSSProperties), clipPath },
    } as never
    // Children only when there is a stroke to add: a void child (an <input>)
    // must not be handed any, even empty ones.
    return stroke
      ? React.cloneElement(
          children,
          merged,
          child.children as React.ReactNode,
          stroke
        )
      : React.cloneElement(children, merged)
  }
  return (
    <div
      ref={setEl}
      className={cn(outlined, className)}
      style={{ ...style, clipPath }}
      {...props}
    >
      {children}
      {stroke}
    </div>
  )
}

/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
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
}: Shape & { width: number; height: number }) {
  if (width <= 0 || height <= 0) return undefined
  const r = pill ? Math.min(width, height) / 2 : px(radius)
  const bottom = corners === "top" ? 0 : r
  return squircleOutline({
    width,
    height,
    radii: { tl: r, tr: r, br: bottom, bl: bottom },
    smoothing: cornerSmoothing,
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
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])

  return [setEl, size] as const
}

type StrokeProps = Shape & {
  dashed?: boolean
  strokeWidth?: number
  className?: string
}

/**
 * The squircle of a `width` × `height` box, stroked so the line's outer edge
 * sits on the box's own clip.
 *
 * The stroke straddles its path, and the <svg> clips its own overflow, so the
 * path runs half a stroke inside the box — and at half a stroke less radius,
 * which keeps it concentric with the clip. At the full radius the line drifts
 * up to 0.2px inward through the corners.
 */
function Stroke({
  width,
  height,
  dashed = false,
  strokeWidth = 1,
  className,
  style,
  svgRef,
  ...shape
}: StrokeProps & {
  width: number
  height: number
  style?: React.CSSProperties
  svgRef?: React.Ref<SVGSVGElement>
}) {
  const inset = strokeWidth / 2
  const d = squircleD({
    ...shape,
    radius: px(shape.radius ?? "lg") - inset,
    width: width - strokeWidth,
    height: height - strokeWidth,
  })
  return (
    <svg
      ref={svgRef}
      aria-hidden
      className={cn("pointer-events-none absolute", className)}
      style={style}
    >
      {d && (
        <path
          d={d}
          transform={`translate(${inset} ${inset})`}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={dashed ? "4 3" : undefined}
        />
      )}
    </svg>
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
  const [el, setEl] = React.useState<SVGSVGElement | null>(null)
  const [size, setSize] = React.useState({ w: 0, h: 0 })

  React.useLayoutEffect(() => {
    if (!el) return
    const measure = () => {
      const b = el.getBoundingClientRect()
      setSize({ w: b.width, h: b.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])

  return (
    <Stroke
      {...props}
      svgRef={setEl}
      width={size.w}
      height={size.h}
      className={cn("inset-0 h-full w-full", className)}
    />
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

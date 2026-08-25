/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { Squircle as SquircleBase } from "@squircle-js/react"
import { getSvgPath } from "figma-squircle"

import { cn } from "@/lib/utils"

// Squircle corners app-wide. The shape is clipped with an SVG `path()`
// computed from the measured box, not by `border-radius` — drop the
// `rounded-*` class at the call site and pass a `radius` token instead.
//
// Two things follow from clipping, both of which the call sites have to
// respect:
//   - An outer `box-shadow` is painted as part of the element, so the clip
//     erases it. A squircled card casts its shadow from a wrapper with
//     `drop-shadow-[...]` instead, which traces the clipped silhouette.
//   - A 1px `border` survives the uniform-radius case: the clip runs at most
//     0.35px inside the border's own curve at these radii, which is
//     sub-pixel. It does NOT survive `pill` — see below.
//
// @squircle-js/react draws the common case. It only exposes one uniform
// radius and no `preserveSmoothing`, so the two shapes it cannot express —
// `corners="top"` and `pill` — are drawn from figma-squircle, the same engine
// it uses internally, through the same `CORNER_SMOOTHING` global.

/**
 * How hard the corners are smoothed, for every squircle in the app: 0 is a
 * plain circular arc, 1 a full superellipse. Figma's own default is 0.6.
 *
 * figma-squircle budgets smoothing against the shorter side — it spends
 * `minSide / 2` on radius first and smooths with what is left, so the
 * effective value is `min(CORNER_SMOOTHING, budget / radius - 1)`. A shape
 * already rounded to a stadium has nothing left over and comes out identical
 * to `0`; `pill` is the way to smooth one anyway.
 */
export const CORNER_SMOOTHING = 0.6

// Mirrors the `--radius-*` scale in index.css, in px (--radius: 0.875rem).
// `cornerRadius` is a number, so the scale has to exist here too — keep the
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
  /**
   * A stadium, smoothed anyway. At a stadium's radius the smoothing budget is
   * exactly zero, so the plain path comes out byte-identical to
   * `cornerSmoothing: 0`; `preserveSmoothing` keeps the requested strength and
   * squeezes the corner's control points to fit instead.
   */
  pill?: boolean
  cornerSmoothing?: number
}

/**
 * The `clip-path` value for a box of a known size. Use this directly when the
 * caller already measures the box (the day strip's travelling pill does), and
 * `useSquircle` when it does not.
 *
 * A `pill` shape must carry no `border-radius`, so it can carry no visible
 * `border` or `ring` either: those follow `border-radius`, and the smoothed
 * stadium does not. Fill-only shapes.
 */
export function squircleD({
  width,
  height,
  radius = "lg",
  corners = "all",
  pill = false,
  cornerSmoothing = CORNER_SMOOTHING,
}: Shape & { width: number; height: number }) {
  if (width === 0 || height === 0) return undefined
  const r = pill ? Math.min(width, height) / 2 : px(radius)
  const corner =
    corners === "top"
      ? {
          topLeftCornerRadius: r,
          topRightCornerRadius: r,
          bottomLeftCornerRadius: 0,
          bottomRightCornerRadius: 0,
        }
      : { cornerRadius: r }
  return getSvgPath({
    width,
    height,
    cornerSmoothing,
    preserveSmoothing: pill,
    ...corner,
  })
}

export function squirclePath(shape: Shape & { width: number; height: number }) {
  const d = squircleD(shape)
  return d && `path('${d}')`
}

/**
 * Measures an element and returns the clip path for it. Measurement runs in a
 * layout effect, so the shape is already right on the first paint.
 */
export function useSquircle<T extends HTMLElement>({
  radius = "lg",
  corners = "all",
  pill = false,
  cornerSmoothing = CORNER_SMOOTHING,
}: Shape = {}) {
  // A callback ref, not a ref object: the element has to be state for the
  // measuring effect to re-run when it arrives.
  const [el, setEl] = React.useState<T | null>(null)
  const [size, setSize] = React.useState({ w: 0, h: 0 })

  React.useLayoutEffect(() => {
    if (!el) return
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])

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

  // A tuple, like useState: an object with a `ref` key reads as a ref object
  // to react-hooks/refs and trips it at every call site.
  return [setEl, { clipPath } as React.CSSProperties] as const
}

/**
 * The squircle drawn as a stroke instead of a fill — an outline that traces
 * the same curve the clip does. Neither a `border` nor a `ring` can: both
 * follow `border-radius`, which a smoothed stadium deliberately does without,
 * so a pill's outline has to be drawn. Absolutely positioned inside a
 * `relative` parent, inheriting `currentColor`, so it costs no layout — which
 * also keeps sibling boxes identical, unlike a border.
 */
export function SquircleOutline({
  dashed = false,
  strokeWidth = 1,
  className,
  ...shape
}: Shape & {
  dashed?: boolean
  strokeWidth?: number
  className?: string
}) {
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

  // The stroke straddles the path, and the <svg> clips its own overflow, so
  // the shape is inset by half a stroke to sit fully inside — matching what
  // `ring-inset` would have done.
  const inset = strokeWidth / 2
  const d = squircleD({
    ...shape,
    width: Math.max(0, size.w - strokeWidth),
    height: Math.max(0, size.h - strokeWidth),
  })
  return (
    <svg
      ref={setEl}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full",
        className
      )}
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

type SquircleProps = Omit<React.ComponentPropsWithoutRef<"div">, "ref"> &
  Shape & { asChild?: boolean }

export function Squircle({
  radius = "lg",
  corners = "all",
  pill = false,
  cornerSmoothing = CORNER_SMOOTHING,
  ...props
}: SquircleProps) {
  // `pill` and `corners="top"` are the shapes the package cannot draw. The
  // branch is on a static prop, so a given call site always renders the same
  // component and neither implementation ever swaps under a live element.
  return pill || corners === "top" ? (
    <ShapedSquircle
      radius={radius}
      corners={corners}
      pill={pill}
      cornerSmoothing={cornerSmoothing}
      {...props}
    />
  ) : (
    <SquircleBase
      cornerRadius={px(radius)}
      cornerSmoothing={cornerSmoothing}
      {...props}
    />
  )
}

function ShapedSquircle({
  radius,
  corners,
  pill,
  cornerSmoothing,
  asChild,
  style,
  children,
  ...props
}: SquircleProps) {
  const [squircleRef, squircleStyle] = useSquircle<HTMLDivElement>({
    radius,
    corners,
    pill,
    cornerSmoothing,
  })
  const merged = { ...style, ...squircleStyle }
  // A local `asChild`: this only ever needs the ref and the clip on the child,
  // never full prop merging, so it costs a cloneElement rather than a Slot.
  if (asChild && React.isValidElement<Record<string, unknown>>(children)) {
    return React.cloneElement(children, {
      ref: squircleRef,
      style: { ...(children.props.style as React.CSSProperties), ...merged },
    } as never)
  }
  return (
    <div ref={squircleRef} style={merged} {...props}>
      {children}
    </div>
  )
}

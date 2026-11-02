import * as React from "react"
import { motion, useMotionValue, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

// The AI mark: one four-point sparkle, the app's only sign for "AI did or will
// do this". It rests turned 6° counterclockwise and paints in currentColor at
// half strength, so it reads the same quiet grey-brown on either theme.
//
// `spinning` drives the fill wait: the star winds up from rest, then keeps
// turning at a breathing speed (slower, quicker, never still) until the flag
// drops. It then coasts on to the next quarter turn — the star has four-fold
// symmetry, so every quarter is a whole round to the eye — and lands at rest
// without a snap. Spinning again mid-landing picks up from the current speed.

const STAR =
  "M7.6211 1.05909C7.96971 -0.35303 9.97718 -0.35303 10.3258 1.05909L11.4233 5.50505C11.5473 6.00735 11.9395 6.39954 12.4418 6.52354L16.8878 7.6211C18.2999 7.96971 18.2999 9.97718 16.8878 10.3258L12.4418 11.4233C11.9395 11.5473 11.5473 11.9395 11.4233 12.4418L10.3258 16.8878C9.97718 18.2999 7.96971 18.2999 7.6211 16.8878L6.52354 12.4418C6.39954 11.9395 6.00735 11.5473 5.50505 11.4233L1.05909 10.3258C-0.35303 9.97718 -0.35303 7.96971 1.05909 7.6211L5.50505 6.52354C6.00735 6.39954 6.39954 6.00735 6.52354 5.50505L7.6211 1.05909Z"

/** The resting tilt, in degrees (negative is counterclockwise). */
const REST = -6

// Spin speed in °/s: a slow cosine around MEAN, so the star visibly speeds up
// and eases off while staying well clear of a stop.
const MEAN = 380
const SWING = 240
const PERIOD = 1.6
// The wind-up from rest, timed so it hands over at the first fast crest.
const WIND_UP = 0.45
// The landing coasts at least this long's worth of the current speed before
// the next quarter turn, so it never brakes hard.
const MIN_COAST = 0.25
const QUARTER = 90

function speedAt(t: number) {
  const cruise = MEAN + SWING * Math.cos((2 * Math.PI * (t - WIND_UP)) / PERIOD)
  if (t >= WIND_UP) return cruise
  const x = t / WIND_UP
  return cruise * x * x * (3 - 2 * x)
}

type Motion =
  | { kind: "rest" }
  | { kind: "spin"; t: number }
  | {
      kind: "land"
      from: number
      v0: number
      dist: number
      dur: number
      u: number
    }

/**
 * The spin as a pure function of the flag, driven per frame. Returns the
 * angle (relative to rest) for a motion value — no React render per frame.
 */
function useSpin(spinning: boolean, enabled: boolean, pace: number) {
  const angle = useMotionValue(REST)
  // Read per frame, so a change of pace never restarts the motion.
  const k = React.useRef(pace)
  React.useLayoutEffect(() => {
    k.current = pace
  }, [pace])
  const state = React.useRef<Motion>({ kind: "rest" })
  const turned = React.useRef(0)
  const speed = React.useRef(0)

  React.useEffect(() => {
    if (!enabled) return
    const s = state.current
    if (spinning && s.kind !== "spin") {
      // From rest the wind-up starts at zero; mid-landing it rejoins the
      // wind-up where its speed matches, so nothing jumps.
      state.current = {
        kind: "spin",
        t: s.kind === "rest" ? 0 : resumeAt(speed.current / k.current),
      }
    } else if (!spinning && s.kind === "spin") {
      const v0 = Math.max(speed.current, 60 * k.current)
      const a0 = turned.current
      const target = Math.ceil((a0 + v0 * MIN_COAST) / QUARTER) * QUARTER
      const dist = target - a0
      // A cubic Hermite from (a0, v0) to (target, 0); keeping v0·dur ≤ 3·dist
      // keeps it monotone, so the star only ever slows into place.
      const dur = Math.min(
        Math.max((2.2 * dist) / v0, 0.45),
        1.2,
        (3 * dist) / v0
      )
      state.current = { kind: "land", from: a0, v0, dist, dur, u: 0 }
    }
    // Otherwise a spin or landing already under way carries on (this also
    // restarts the loop after StrictMode's effect replay).
    if (state.current.kind === "rest") return

    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const m = state.current
      if (m.kind === "spin") {
        // The whole curve runs on a stretched clock: wind-up, breathing and
        // speed all scale together, so a slower star moves the same way.
        m.t += dt * k.current
        speed.current = k.current * speedAt(m.t)
        turned.current += speed.current * dt
      } else if (m.kind === "land") {
        m.u = Math.min(m.u + dt / m.dur, 1)
        const u = m.u
        const h01 = u * u * (3 - 2 * u)
        const h10 = u * (1 - u) * (1 - u)
        turned.current = m.from + m.dist * h01 + m.v0 * m.dur * h10
        // d/dt of the Hermite, for a resume mid-landing.
        const d01 = 6 * u * (1 - u)
        const d10 = (1 - u) * (1 - 3 * u)
        speed.current = (m.dist * d01) / m.dur + m.v0 * d10
        if (u >= 1) {
          turned.current = 0
          speed.current = 0
          state.current = { kind: "rest" }
          angle.set(REST)
          return
        }
      } else {
        return
      }
      angle.set(REST + (turned.current % 360))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [spinning, enabled, angle])

  return angle
}

// The point in the wind-up whose speed is v (the wind-up only speeds up, so
// a bisection finds it); at or above the first crest, the crest itself.
function resumeAt(v: number) {
  let lo = 0
  let hi = WIND_UP
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (speedAt(mid) < v) lo = mid
    else hi = mid
  }
  return hi
}

export function AiSparkle({
  spinning = false,
  solid = false,
  speed = 1,
  className,
  ...rest
}: {
  spinning?: boolean
  /** Pace of the spin against a fill's (1); below 1 is slower. */
  speed?: number
  /** Full strength, for a star beside text on a filled button. */
  solid?: boolean
} & Omit<
  React.ComponentProps<typeof motion.svg>,
  "children" | "viewBox" | "style"
>) {
  const reduce = useReducedMotion() ?? false
  const rotate = useSpin(spinning, !reduce, speed)
  return (
    <motion.svg
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden={rest["aria-label"] ? undefined : true}
      role={rest["aria-label"] ? "img" : undefined}
      {...rest}
      className={cn(
        "shrink-0",
        // With reduced motion a fill's wait shows as the old quiet pulse
        // instead; a slowed, decorative spin simply rests.
        reduce && spinning && speed >= 1 && "animate-pulse",
        className
      )}
      style={{ rotate }}
    >
      <path d={STAR} fill="currentColor" fillOpacity={solid ? 1 : 0.5} />
    </motion.svg>
  )
}

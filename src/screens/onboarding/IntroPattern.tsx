import * as React from "react"
import { motion } from "motion/react"

import banana from "@/assets/foods/banana.svg"
import eggplant from "@/assets/foods/eggplant.svg"
import leek from "@/assets/foods/leek.svg"
import lettuce from "@/assets/foods/lettuce.svg"
import orange from "@/assets/foods/orange.svg"
import strawberry from "@/assets/foods/strawberry.svg"
import { useI18n } from "@/lib/i18n/useI18n"
import { packPattern, type Tile } from "./pattern"

// The first-run intro (#35): the six food illustrations from the wordmark
// animation fill the screen as a loose pattern, pop in from the centre out,
// hold a beat, then shrink away while the pattern's bed fades, revealing the
// welcome step already rendered beneath. About two seconds; a tap anywhere
// skips straight to the exit.
//
// Like the wordmark's own Lottie intro, this is an entrance animation of its
// own rather than layout content, so the uniform pop (scale from 0) is allowed
// here; nothing stretches, and nothing in the layout moves (spec § Motion).
// The caller skips it entirely under reduced motion.

// width ÷ height of each illustration (their viewBoxes), in FOODS order.
const FOODS = [
  { src: orange, aspect: 1.081 },
  { src: banana, aspect: 0.568 },
  { src: eggplant, aspect: 0.571 },
  { src: leek, aspect: 0.479 },
  { src: strawberry, aspect: 1.102 },
  { src: lettuce, aspect: 0.961 },
] as const

const ASPECTS = FOODS.map((f) => f.aspect)

// Timeline, in seconds.
const POP_SPREAD = 0.38 // centre → corners stagger on the way in
const POP = 0.32
const HOLD_UNTIL = 1.25 // when the first tiles start leaving
const LEAVE_SPREAD = 0.42
const LEAVE = 0.26
const BED_FADE = 0.45

type Phase = "in" | "out"

export function IntroPattern({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const [phase, setPhase] = React.useState<Phase>("in")
  // Packed once per mount, against the viewport it opens on.
  const [tiles] = React.useState(() => layout())

  // In → out after the hold; out → done once the last tile has left.
  React.useEffect(() => {
    if (phase === "in") {
      const id = window.setTimeout(() => setPhase("out"), HOLD_UNTIL * 1000)
      return () => window.clearTimeout(id)
    }
    const id = window.setTimeout(onDone, (LEAVE_SPREAD + LEAVE + 0.05) * 1000)
    return () => window.clearTimeout(id)
  }, [phase, onDone])

  return (
    <button
      type="button"
      aria-label={t.onboarding.skipIntro}
      onClick={() => setPhase("out")}
      className="fixed inset-0 z-50 cursor-default overflow-hidden"
    >
      <motion.div
        className="absolute inset-0 bg-background"
        initial={false}
        animate={{ opacity: phase === "out" ? 0 : 1 }}
        transition={{ duration: BED_FADE, ease: "easeOut", delay: 0.1 }}
      />
      {tiles.map((tile, i) => (
        <motion.img
          key={i}
          src={FOODS[tile.kind].src}
          alt=""
          draggable={false}
          className="pointer-events-none absolute select-none"
          style={{
            left: tile.x - tile.w / 2,
            top: tile.y - tile.h / 2,
            width: tile.w,
            height: tile.h,
            rotate: tile.rotate,
          }}
          initial={{ scale: 0 }}
          animate={{ scale: phase === "in" ? 1 : 0 }}
          transition={
            phase === "in"
              ? {
                  duration: POP,
                  ease: "backOut",
                  delay: tile.reach * POP_SPREAD + tile.jitter,
                }
              : {
                  duration: LEAVE,
                  ease: "easeIn",
                  delay: tile.reach * LEAVE_SPREAD,
                }
          }
        />
      ))}
    </button>
  )
}

type PlacedTile = Tile & { reach: number; jitter: number }

function layout(): PlacedTile[] {
  const w = window.innerWidth
  const h = window.innerHeight
  // Scale tile sizes gently with the screen so a tablet isn't a sea of crumbs.
  const k = Math.min(1.6, Math.max(1, Math.min(w, h) / 390))
  const tiles = packPattern(w, h, ASPECTS, {
    min: 26 * k,
    max: 120 * k,
    gap: 12 * k,
  })
  const cx = w / 2
  const cy = h / 2
  const far = Math.hypot(cx, cy)
  return tiles.map((tile) => ({
    ...tile,
    // 0 at the centre, 1 at the corners: drives the radiating stagger.
    reach: Math.min(1, Math.hypot(tile.x - cx, tile.y - cy) / far),
    jitter: Math.random() * 0.06,
  }))
}

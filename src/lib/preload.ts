import * as React from "react"

import { loadWordmarkPlayer } from "@/screens/main/wordmark-player"

// Everything the first screens need to paint in their final form (#35): the
// web fonts and the wordmark animation. Started once at boot (main.tsx), so
// the downloads run alongside the Guest sign-in instead of after it. Only
// first run waits on it: App holds the splash until the welcome screen can
// appear without a font swap (layout shift) or a static logo frame before the
// animation. The main screen uses the same assets but never waits; on a
// returning launch they are already cached anyway.

// Variable fonts keep every weight in one file, so one face per family would
// do; listing the weights the first screens use keeps that true if a family is
// ever split into static weights. Fraunces isn't here: the splash logo is an
// inline SVG, and the welcome screen's wordmark is the animation.
const FONTS = [
  '400 16px "Public Sans Variable"',
  '500 16px "Public Sans Variable"',
  '600 16px "Public Sans Variable"',
  '700 16px "Public Sans Variable"',
  '900 16px "Nunito Variable"',
]

// Counted from boot. A stuck download must never hold the splash for long:
// past this the welcome screen shows anyway, at worst with a late font swap.
const GIVE_UP_MS = 6000

let started: Promise<void> | null = null
let ready = false

function loadFont(font: string): Promise<unknown> {
  try {
    return document.fonts.load(font).catch(() => null)
  } catch {
    return Promise.resolve()
  }
}

/** Start loading the first-run assets (idempotent). Never rejects. */
export function preloadAssets(): Promise<void> {
  if (!started) {
    const all = Promise.all([
      ...FONTS.map(loadFont),
      loadWordmarkPlayer().catch(() => null),
    ])
    const giveUp = new Promise((resolve) => setTimeout(resolve, GIVE_UP_MS))
    started = Promise.race([all, giveUp]).then(() => {
      ready = true
    })
  }
  return started
}

/** Whether the first-run assets have loaded (or the wait gave up). */
export function useAssetsReady(): boolean {
  const [done, setDone] = React.useState(() => ready)
  React.useEffect(() => {
    if (done) return
    let live = true
    void preloadAssets().then(() => {
      if (live) setDone(true)
    })
    return () => {
      live = false
    }
  }, [done])
  return done
}

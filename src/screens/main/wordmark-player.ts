import type { LottiePlayer } from "lottie-web"

// The animated wordmark's player (lottie_light) and animation JSON, loaded
// once per page and shared. They ride in a lazy chunk so the main bundle stays
// flat. Loading is kicked off early by the asset preload (src/lib/preload.ts),
// so a wordmark mounting later — the welcome screen's, the header's — can
// start straight on the animation instead of painting the static text first.

export type WordmarkPlayer = { lottie: LottiePlayer; animationData: unknown }

let pending: Promise<WordmarkPlayer> | null = null
let loaded: WordmarkPlayer | null = null

/** Load (or reuse) the player. A failed load is forgotten, so a later call retries. */
export function loadWordmarkPlayer(): Promise<WordmarkPlayer> {
  if (!pending) {
    pending = Promise.all([
      import("lottie-web/build/player/lottie_light"),
      import("@/assets/yaffle-wordmark.json"),
    ]).then(([{ default: lottie }, { default: animationData }]) => {
      loaded = { lottie, animationData }
      return loaded
    })
    pending.catch(() => {
      pending = null
    })
  }
  return pending
}

/** The player if it has already loaded, else null. Synchronous. */
export function loadedWordmarkPlayer(): WordmarkPlayer | null {
  return loaded
}

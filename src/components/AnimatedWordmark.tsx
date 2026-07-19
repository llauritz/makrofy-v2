import * as React from "react"
import type { AnimationItem } from "lottie-web"

import { useI18n } from "@/lib/i18n/useI18n"

// The animated Yaffle wordmark (#79). The static Fraunces text paints first —
// the instant first frame (ADR 0011) must never wait on a player — then the
// Lottie swaps in and plays the intro once, holding its final frame. A tap
// replays it. The player (lottie_light, SVG renderer) and the animation JSON
// ride in a lazy chunk, so the main bundle stays flat; reduced motion or a
// failed load simply keep the static text.

// The last entrance keyframe in the export sits at frame 25; everything after
// is a static hold to frame 304. Playback stops just past the settle instead
// of ticking silently through the hold — but must reach past 25, or the
// letters freeze mid-entrance.
const INTRO_SEGMENT: [number, number] = [0, 26]

export function AnimatedWordmark() {
  const { t } = useI18n()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const animRef = React.useRef<AnimationItem | null>(null)
  const [playerReady, setPlayerReady] = React.useState(false)

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let disposed = false
    let anim: AnimationItem | undefined
    Promise.all([
      import("lottie-web/build/player/lottie_light"),
      import("@/assets/yaffle-wordmark.json"),
    ])
      .then(([{ default: lottie }, { default: animationData }]) => {
        if (disposed || !containerRef.current) return
        anim = lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: false,
          autoplay: true,
          animationData,
          initialSegment: INTRO_SEGMENT,
          rendererSettings: { preserveAspectRatio: "xMinYMid meet" },
        })
        // Whole frames only: the comp is authored at 12 fps, and subframe
        // interpolation would smooth away that stop-motion cadence.
        anim.setSubframe(false)
        animRef.current = anim
        setPlayerReady(true)
      })
      .catch(() => {
        // Best-effort: the static wordmark stays.
      })
    return () => {
      disposed = true
      anim?.destroy()
      animRef.current = null
    }
  }, [])

  return (
    <button
      type="button"
      aria-label={t.app.name}
      onClick={() => animRef.current?.goToAndPlay(0, true)}
      className="wordmark-anim block"
    >
      {!playerReady && (
        <span className="font-wordmark text-[30px] leading-none font-semibold">
          {t.app.name}
        </span>
      )}
      {/* The export carries a sliver of padding inside the comp bounds; the
          -2px pulls the glyphs optically flush with the header's edge, where
          the static text sits. */}
      <div
        ref={containerRef}
        aria-hidden
        className={playerReady ? "-ml-[2px] h-[30px] w-[150px]" : "hidden"}
      />
    </button>
  )
}

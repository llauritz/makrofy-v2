import * as React from "react"
import type { AnimationItem, LottiePlayer } from "lottie-web"

import { useI18n } from "@/lib/i18n/useI18n"

// The animated Yaffle wordmark (#79). The static Fraunces text paints first —
// the instant first frame (ADR 0011) must never wait on a player — then the
// Lottie swaps in and plays the intro once, holding its final frame. A tap
// replays it. The player (lottie_light, SVG renderer) and the animation JSON
// ride in a lazy chunk, so the main bundle stays flat; reduced motion or a
// failed load simply keep the static text. The text→player swap is a cut,
// not the house fade-through (spec § Motion): the intro's own entrance is
// the appearance animation, and a fade layered under it would double up.

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

// A hidden stretch at least this long reads as "opening the app again" —
// resurfacing then replays the intro. Shorter hops (a quick paste from
// another app mid-log) keep the settled wordmark.
const REPLAY_AFTER_HIDDEN_MS = 10_000

// The last entrance keyframe in the export sits at frame 25; everything after
// is a static hold to frame 304. Playback stops just past the settle instead
// of ticking silently through the hold — but must reach past 25, or the
// letters freeze mid-entrance.
const INTRO_SEGMENT: [number, number] = [0, 26]

type Player = { lottie: LottiePlayer; animationData: unknown }

export function AnimatedWordmark() {
  const { t } = useI18n()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const animRef = React.useRef<AnimationItem | null>(null)
  const [player, setPlayer] = React.useState<Player | null>(null)

  React.useEffect(() => {
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return
    let disposed = false
    Promise.all([
      import("lottie-web/build/player/lottie_light"),
      import("@/assets/yaffle-wordmark.json"),
    ])
      .then(([{ default: lottie }, { default: animationData }]) => {
        if (!disposed) setPlayer({ lottie, animationData })
      })
      .catch(() => {
        // Best-effort: the static wordmark stays.
      })
    return () => {
      disposed = true
    }
  }, [])

  // Second phase: the container only exists once `player` renders the button,
  // so the animation mounts here rather than in the load handler.
  React.useEffect(() => {
    if (!player || !containerRef.current) return
    const anim = player.lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop: false,
      autoplay: true,
      animationData: player.animationData,
      initialSegment: INTRO_SEGMENT,
      rendererSettings: { preserveAspectRatio: "xMinYMid meet" },
    })
    // Whole frames only: the comp is authored at 12 fps, and subframe
    // interpolation would smooth away that stop-motion cadence.
    anim.setSubframe(false)
    animRef.current = anim
    return () => {
      anim.destroy()
      animRef.current = null
    }
  }, [player])

  // Relaunches that never remount React must still play the intro — opening
  // the app should never greet with the previous run's frozen end frame. Two
  // signals: a bfcache restore (pageshow with persisted), and the tab or
  // installed PWA resurfacing after a long stretch in the background.
  //
  // The bfcache path also scrubs its own snapshot: pagehide hides the
  // animation via a direct DOM write (React state wouldn't flush before the
  // page freezes), so the restored DOM paints clean and pageshow unhides
  // into the replay. OS-level gesture previews are pixel screenshots of the
  // last painted frame and stay out of reach — this only cleans the live
  // first paint.
  React.useEffect(() => {
    if (!player) return
    const replay = () => animRef.current?.goToAndPlay(0, true)
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted && containerRef.current) {
        containerRef.current.style.visibility = "hidden"
      }
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        if (containerRef.current) containerRef.current.style.visibility = ""
        replay()
      }
    }
    let hiddenAt: number | null = null
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()
      } else if (
        hiddenAt !== null &&
        Date.now() - hiddenAt >= REPLAY_AFTER_HIDDEN_MS
      ) {
        replay()
      }
    }
    window.addEventListener("pagehide", onPageHide)
    window.addEventListener("pageshow", onPageShow)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.removeEventListener("pagehide", onPageHide)
      window.removeEventListener("pageshow", onPageShow)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [player])

  // The tap-to-replay button only exists once there is a player to replay;
  // before that (and forever under reduced motion or a failed load) the
  // wordmark stays the same plain div the header always had.
  if (!player) {
    return (
      <div className="font-wordmark text-[30px] leading-none font-semibold">
        {t.app.name}
      </div>
    )
  }
  return (
    <button
      type="button"
      aria-label={t.app.name}
      onClick={() => animRef.current?.goToAndPlay(0, true)}
      className="wordmark-anim block"
    >
      {/* The export carries a sliver of padding inside the comp bounds; the
          -2px pulls the glyphs optically flush with the header's edge, where
          the static text sits. */}
      <div
        ref={containerRef}
        aria-hidden
        className="-ml-[2px] h-[30px] w-[150px]"
      />
    </button>
  )
}

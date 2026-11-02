import * as React from "react"
import type { AnimationItem } from "lottie-web"

import { useI18n } from "@/lib/i18n/useI18n"
import {
  loadedWordmarkPlayer,
  loadWordmarkPlayer,
  type WordmarkPlayer,
} from "./wordmark-player"

// The animated Yaffle wordmark (#79). The instant first frame (ADR 0011) must
// never wait on a player, but the wordmark itself may: when the player hasn't
// loaded yet (a cold launch, usually a few hundred ms), its slot stays empty,
// laid out but invisible, and the intro plays into it once the player
// arrives. Painting the static Fraunces text first and then cutting to the
// intro, which opens on the food shapes, read as the wordmark playing twice
// (L, Nov 2026: empty for a moment is fine). When the player has loaded (the
// asset preload in src/lib/preload.ts often sees to that), the animation
// starts on the very first frame. It plays the intro once, holding its final
// frame; a tap replays it. Reduced motion or a failed load show the static
// text. A load that takes longer than SHOW_TEXT_AFTER_MS shows the text too,
// and the player then takes over at its settled final frame without an intro,
// so the text never gives way to the food shapes.

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

// A hidden stretch at least this long reads as "opening the app again" —
// resurfacing then replays the intro. Shorter hops (a quick paste from
// another app mid-log) keep the settled wordmark.
const REPLAY_AFTER_HIDDEN_MS = 10_000

// How long the slot may stay empty waiting for the player before the static
// text shows instead. Long enough to cover a phone's cold launch with the
// chunk in the service-worker cache; short enough that a stuck or offline
// load doesn't leave the header without its name.
const SHOW_TEXT_AFTER_MS = 2_000

// The last entrance keyframe in the export sits at frame 25; everything after
// is a static hold to frame 304. Playback stops just past the settle instead
// of ticking silently through the hold — but must reach past 25, or the
// letters freeze mid-entrance.
const INTRO_SEGMENT: [number, number] = [0, 26]

// The comp is 1000 × 200: the wordmark is five times as wide as it is tall.
const ASPECT = 5

function reducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/** `height` in px: 30 in the header, larger on the welcome screen (#35). */
export function AnimatedWordmark({ height = 30 }: { height?: number }) {
  const { t } = useI18n()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const animRef = React.useRef<AnimationItem | null>(null)
  const [player, setPlayer] = React.useState<WordmarkPlayer | null>(() =>
    reducedMotion() ? null : loadedWordmarkPlayer()
  )
  // Whether the static text is showing while there is no player: from the
  // start under reduced motion, else once the load fails or runs long.
  const [showText, setShowText] = React.useState(reducedMotion)
  // Once the text has been seen, a late player must not replay the intro.
  const skipIntro = React.useRef(false)

  React.useEffect(() => {
    if (player || reducedMotion()) return
    let disposed = false
    const reveal = () => {
      if (disposed) return
      skipIntro.current = true
      setShowText(true)
    }
    const timer = setTimeout(reveal, SHOW_TEXT_AFTER_MS)
    loadWordmarkPlayer()
      .then((loaded) => {
        if (!disposed) setPlayer(loaded)
      })
      .catch(reveal) // Best-effort: the static wordmark shows instead.
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [player])

  // Second phase: the container only exists once `player` renders the button,
  // so the animation mounts here rather than in the load handler. A layout
  // effect, so the first animation frame is in place before the browser
  // paints: never an empty frame where the wordmark should be.
  React.useLayoutEffect(() => {
    if (!player || !containerRef.current) return
    const settled = skipIntro.current
    const anim = player.lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop: false,
      autoplay: !settled,
      animationData: player.animationData,
      initialSegment: INTRO_SEGMENT,
      rendererSettings: { preserveAspectRatio: "xMinYMid meet" },
    })
    // Whole frames only: the comp is authored at 12 fps, and subframe
    // interpolation would smooth away that stop-motion cadence.
    anim.setSubframe(false)
    // Taking over from the static text: show the end of the intro, as the
    // text already did, rather than starting over from the food shapes.
    if (settled) anim.goToAndStop(INTRO_SEGMENT[1] - 1, true)
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
  // wordmark is the same plain div the header always had, kept invisible
  // while the player may still arrive in time to play the intro.
  if (!player) {
    return (
      <div
        className="font-wordmark leading-none font-semibold"
        style={{ fontSize: height, visibility: showText ? undefined : "hidden" }}
      >
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
        className="-ml-[2px]"
        style={{ height, width: height * ASPECT }}
      />
    </button>
  )
}

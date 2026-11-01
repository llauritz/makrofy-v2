import * as React from "react"
import { motion, MotionConfig } from "motion/react"

import { useTheme } from "@/components/theme-provider"
import { Spinner } from "@/components/ui/spinner"
import { DEFAULT_GOAL_KCAL, setGoal } from "@/data/goal"
import { useEntriesStatus, useGoalStatus, useIdentity } from "@/data/hooks"
import { db } from "@/lib/firebase"
import { useAssetsReady, useFontReady, WORDMARK_FONT } from "@/lib/preload"
import { useI18n } from "@/lib/i18n/useI18n"
import { GlossaryScreen } from "@/screens/glossary/GlossaryScreen"
import { FADE_IN, SPRING } from "@/screens/main/anim"
import { MainScreen } from "@/screens/main/MainScreen"
import { resolveAppView } from "@/screens/onboarding/gate"
import { OnboardingScreen } from "@/screens/onboarding/OnboardingScreen"
import { PaywallProvider } from "@/screens/paywall/Paywall"
import { StatsScreen } from "@/screens/stats/StatsScreen"

// Dev convenience: ?theme=dark|light forces the mode (shareable per-mode links,
// headless screenshots of both modes) on top of the real Settings control.
function useThemeParam() {
  const { setTheme } = useTheme()
  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("theme")
    if (t === "dark" || t === "light") setTheme(t)
  }, [setTheme])
}

// The top-level screens the app switches between once past onboarding (#35);
// the Glossary (#40) is a full screen reached from Settings — and from the
// stats dashboard (#22), which is itself the full screen behind the summary
// card's stats button. Back returns to whichever screen opened the Glossary.
type AppScreen = "main" | "glossary" | "stats"

export function App() {
  useThemeParam()

  const uid = useIdentity()
  const goalStatus = useGoalStatus(uid)
  // Only asked while the Goal is unset: has this profile logged before?
  const entriesStatus = useEntriesStatus(goalStatus === "unset" ? uid : null)
  const view = resolveAppView(uid, goalStatus, entriesStatus)
  const assetsReady = useAssetsReady()

  // A profile that logged while onboarding was parked but never set a Goal
  // gets the default written once — the figure its ring already shows — so
  // later launches resolve from the Goal (and the boot mirror) at once
  // instead of waiting on the Entries check.
  const needsDefaultGoal =
    uid !== null && goalStatus === "unset" && entriesStatus === "some"
  React.useEffect(() => {
    if (needsDefaultGoal && uid) setGoal(db, uid, { kcal: DEFAULT_GOAL_KCAL })
  }, [needsDefaultGoal, uid])
  // App-level view state: which full screen is showing. The screens swap by a
  // plain conditional below — only one is mounted at a time. The Glossary
  // remembers its opener (Settings on Main, or the stats dashboard) so its
  // back button returns where the user came from.
  const [screen, setScreen] = React.useState<AppScreen>("main")
  const glossaryFrom = React.useRef<AppScreen>("main")
  const openGlossary = (from: AppScreen) => {
    glossaryFrom.current = from
    setScreen("glossary")
  }

  // Splash until identity and the first Goal snapshot settle, so the ring never
  // flashes the fallback goal before the synced value arrives. First run also
  // holds it until the fonts and the wordmark animation have loaded
  // (src/lib/preload.ts, capped), so the welcome screen appears in its final
  // form: no font swap reflowing it, no static logo before the animation.
  if (view === "loading" || (view === "onboarding" && !assetsReady)) {
    return <Splash />
  }

  // First run (#35): welcome, then goal. Writing the Goal flips the gate to
  // "main" through the Goal listener; nothing here switches by hand.
  if (view === "onboarding") {
    return (
      <MotionConfig reducedMotion="user">
        <motion.div
          key="onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={FADE_IN}
        >
          <OnboardingScreen
            onSubmit={(kcal) => uid && setGoal(db, uid, { kcal })}
          />
        </motion.div>
      </MotionConfig>
    )
  }

  // reducedMotion="user": with the OS reduce-motion setting on, movement
  // snaps and fades remain — the degraded mode of spec § Motion.
  //
  // The two screens swap: Main (and the Base UI Settings sheet it owns)
  // unmounts as the Glossary mounts, so the modal sheet — which makes the rest
  // of the page inert while open — tears down cleanly instead of trapping the
  // Glossary beneath it. A plain conditional (no AnimatePresence exit to
  // coordinate against the sheet's teardown); the arriving screen just fades in
  // — no movement, so the swap stays within the motion law (spec § Motion).
  // Cost: returning to Main resets its transient view (the selected Day) —
  // acceptable for a Settings round-trip.
  return (
    <MotionConfig reducedMotion="user">
      {screen === "glossary" ? (
        <motion.div
          key="glossary"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={SPRING}
        >
          <GlossaryScreen onBack={() => setScreen(glossaryFrom.current)} />
        </motion.div>
      ) : screen === "stats" ? (
        <motion.div
          key="stats"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={SPRING}
        >
          <StatsScreen
            onBack={() => setScreen("main")}
            onOpenGlossary={() => openGlossary("stats")}
          />
        </motion.div>
      ) : (
        <motion.div
          key="main"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={FADE_IN}
        >
          <PaywallProvider>
            <MainScreen
              onOpenGlossary={() => openGlossary("main")}
              onOpenStats={() => setScreen("stats")}
            />
          </PaywallProvider>
        </motion.div>
      )}
    </MotionConfig>
  )
}

// A wait shorter than this never shows the spinner: on a good connection the
// splash is gone before it would appear, and one that blinks on and off reads
// as a glitch (as in DaySyncSpinner).
const SPLASH_SPINNER_AFTER_MS = 600

// A quiet launch screen in the app's own colours while identity and the first
// Goal snapshot settle. It carries the resolved theme's background, so the
// hand-off is continuous — the main screen takes over without a flash of
// unstyled or wrong-theme content. The wordmark stays hidden until its own
// font has loaded, then fades in, rather than painting in a fallback face and
// jumping when Fraunces arrives. A wait that outlasts SPLASH_SPINNER_AFTER_MS
// adds the log's spinner below it, placed from the screen's centre so neither
// ever moves the other.
function Splash() {
  const { t } = useI18n()
  const fontReady = useFontReady(WORDMARK_FONT)
  const [slow, setSlow] = React.useState(false)
  React.useEffect(() => {
    const id = setTimeout(() => setSlow(true), SPLASH_SPINNER_AFTER_MS)
    return () => clearTimeout(id)
  }, [])
  return (
    <div className="relative flex min-h-svh items-center justify-center bg-background text-muted-foreground">
      <motion.div
        initial={false}
        animate={{ opacity: fontReady ? 1 : 0 }}
        transition={FADE_IN}
        style={{ visibility: fontReady ? "visible" : "hidden" }}
        className="font-wordmark text-3xl font-semibold"
      >
        {t.app.name}
      </motion.div>
      {/* 50% + half the wordmark's 36 px line + a 20 px gap. */}
      {slow && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="absolute inset-x-0 top-[calc(50%+38px)] flex justify-center"
        >
          <Spinner />
        </motion.div>
      )}
    </div>
  )
}

export default App

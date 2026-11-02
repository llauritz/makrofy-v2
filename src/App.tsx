import * as React from "react"
import { motion, MotionConfig } from "motion/react"

import { useTheme } from "@/components/theme-provider"
import { Spinner } from "@/components/ui/spinner"
import { YaffleLogo } from "@/components/ui/yaffle-logo"
import { readBootMirror } from "@/data/boot-mirror"
import { DEFAULT_GOAL_KCAL, setGoal } from "@/data/goal"
import { useEntriesStatus, useGoalStatus, useIdentity } from "@/data/hooks"
import { auth, db } from "@/lib/firebase"
import { bootSplashShowing, dismissBootSplash } from "@/lib/boot-splash"
import { useAssetsReady } from "@/lib/preload"
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
  // Read once: has this device ever held a profile? If not, the welcome
  // screen needn't wait on the Guest sign-in or the server (see gate.ts).
  const [freshDevice] = React.useState(() => readBootMirror() === null)
  const view = resolveAppView(uid, goalStatus, entriesStatus, freshDevice)
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
  // On a fresh device the welcome can show before the Guest sign-in lands, so
  // a goal confirmed in that gap waits here and is written the moment there is
  // a uid to write it against; the Goal listener then moves on to main.
  const pendingGoal = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (uid && pendingGoal.current !== null) {
      setGoal(db, uid, { kcal: pendingGoal.current })
      pendingGoal.current = null
    }
  }, [uid])
  const submitGoal = (kcal: number) => {
    const target = uid ?? auth.currentUser?.uid
    if (target) setGoal(db, target, { kcal })
    else pendingGoal.current = kcal
  }

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
  const showSplash =
    view === "loading" || (view === "onboarding" && !assetsReady)
  // index.html's static splash covers everything until the first real screen
  // commits; a layout effect removes it in that same frame.
  React.useLayoutEffect(() => {
    if (!showSplash) dismissBootSplash()
  }, [showSplash])
  if (showSplash) return <Splash />

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
          <OnboardingScreen onSubmit={submitGoal} />
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

// The launch splash: the logo, and the log's spinner below it once the wait
// outlasts 0.6 s (both styled by .splash in src/index.css). It carries the
// resolved theme's background, so the hand-off is continuous — the next screen
// takes over without a flash of unstyled or wrong-theme content. On a first
// run index.html's static copy is already showing this (painted before any
// script ran), so while it is up this renders only the background beneath
// it: a second copy would restart the fades and the spin. When the app has to
// splash on its own (a returning launch whose mirror didn't apply, an account
// switch), it draws the same thing itself.
function Splash() {
  const { t } = useI18n()
  const [covered] = React.useState(bootSplashShowing)
  if (covered) return <div className="min-h-svh bg-background" />
  return (
    <div className="splash" role="img" aria-label={t.app.name}>
      <YaffleLogo height={36} className="splash-logo" />
      <div className="splash-spinner" aria-hidden>
        <Spinner />
      </div>
    </div>
  )
}

export default App

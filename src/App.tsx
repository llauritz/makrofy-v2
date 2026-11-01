import * as React from "react"
import { motion, MotionConfig } from "motion/react"

import { useTheme } from "@/components/theme-provider"
import { DEFAULT_GOAL_KCAL, setGoal } from "@/data/goal"
import { useEntriesStatus, useGoalStatus, useIdentity } from "@/data/hooks"
import { db } from "@/lib/firebase"
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
  // flashes the fallback goal before the synced value arrives.
  if (view === "loading") return <Splash />

  // First run (#35): welcome, then goal. Writing the Goal flips the gate to
  // "main" through the Goal listener; nothing here switches by hand.
  if (view === "onboarding") {
    return (
      <MotionConfig reducedMotion="user">
        <OnboardingScreen
          onSubmit={(kcal) => uid && setGoal(db, uid, { kcal })}
        />
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

// A quiet launch screen in the app's own colours while identity and the first
// Goal snapshot settle. It carries the resolved theme's background, so the
// hand-off is continuous — the main screen takes over without a flash of
// unstyled or wrong-theme content.
function Splash() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <div className="font-wordmark text-3xl font-semibold text-muted-foreground">
        {t.app.name}
      </div>
    </div>
  )
}

export default App

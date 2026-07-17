import * as React from "react"
import { motion, MotionConfig } from "motion/react"

import { useTheme } from "@/components/theme-provider"
import { useGoalStatus, useIdentity } from "@/data/hooks"
import { useI18n } from "@/lib/i18n/useI18n"
import { GlossaryScreen } from "@/screens/glossary/GlossaryScreen"
import { FADE_IN, SPRING } from "@/screens/main/anim"
import { MainScreen } from "@/screens/main/MainScreen"
import { resolveAppView } from "@/screens/onboarding/gate"

// Dev convenience: ?theme=dark|light forces the mode (shareable per-mode links,
// headless screenshots of both modes) on top of the real Settings control.
function useThemeParam() {
  const { setTheme } = useTheme()
  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("theme")
    if (t === "dark" || t === "light") setTheme(t)
  }, [setTheme])
}

// The top-level screens the app switches between. Onboarding is parked (#35);
// the Glossary (#40) is a full screen reached from Settings and returns to Main.
type AppScreen = "main" | "glossary"

export function App() {
  useThemeParam()

  const uid = useIdentity()
  const goalStatus = useGoalStatus(uid)
  const view = resolveAppView(uid, goalStatus)
  // App-level view state (the mechanism #22's stats dashboard will also use):
  // which full screen is showing. The two screens swap by a plain conditional
  // below — only one is mounted at a time.
  const [screen, setScreen] = React.useState<AppScreen>("main")

  // Splash until identity and the first Goal snapshot settle, so the ring never
  // flashes the fallback goal before the synced value arrives.
  if (view === "loading") return <Splash />

  // First-run onboarding (src/screens/onboarding/OnboardingScreen.tsx) is PARKED
  // pending a rework — see issue #35. Until then a fresh profile (view
  // "onboarding") is treated like a returning one: straight to the main screen,
  // where the goal is set in Settings and the ring falls back to
  // DEFAULT_GOAL_KCAL meanwhile. Re-enable by rendering OnboardingScreen when
  // `view === "onboarding"`.
  //
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
          <GlossaryScreen onBack={() => setScreen("main")} />
        </motion.div>
      ) : (
        <motion.div
          key="main"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={FADE_IN}
        >
          <MainScreen onOpenGlossary={() => setScreen("glossary")} />
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

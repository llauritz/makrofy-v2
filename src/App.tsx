import * as React from "react"

import { useTheme } from "@/components/theme-provider"
import { useGoalStatus, useIdentity } from "@/data/hooks"
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

export function App() {
  useThemeParam()

  const uid = useIdentity()
  const goalStatus = useGoalStatus(uid)
  const view = resolveAppView(uid, goalStatus)

  // Splash until identity and the first Goal snapshot settle, so the ring never
  // flashes the fallback goal before the synced value arrives.
  if (view === "loading") return <Splash />

  // First-run onboarding (src/screens/onboarding/OnboardingScreen.tsx) is PARKED
  // pending a rework — see issue #35. Until then a fresh profile (view
  // "onboarding") is treated like a returning one: straight to the main screen,
  // where the goal is set in Settings and the ring falls back to
  // DEFAULT_GOAL_KCAL meanwhile. Re-enable by rendering OnboardingScreen when
  // `view === "onboarding"`.
  return <MainScreen />
}

// A quiet launch screen in the app's own colours while identity and the first
// Goal snapshot settle. It carries the resolved theme's background, so the
// hand-off is continuous — the main screen takes over without a flash of
// unstyled or wrong-theme content.
function Splash() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <div className="font-wordmark text-3xl font-semibold text-muted-foreground">
        Yaffle
      </div>
    </div>
  )
}

export default App

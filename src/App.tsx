import * as React from "react"

import { useTheme } from "@/components/theme-provider"
import { setGoal } from "@/data/goal"
import { useGoalStatus, useIdentity } from "@/data/hooks"
import { db } from "@/lib/firebase"
import { MainScreen } from "@/screens/main/MainScreen"
import { resolveAppView } from "@/screens/onboarding/gate"
import { OnboardingScreen } from "@/screens/onboarding/OnboardingScreen"

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

  // Splash until identity and the first Goal snapshot settle, so a returning
  // user never flashes the onboarding screen (spec § Onboarding).
  if (view === "loading") return <Splash />

  // First run: set the one synced Goal, then the live snapshot flips us to the
  // main screen — onboarding is a data state, not a route to navigate back to.
  if (view === "onboarding") {
    return (
      <OnboardingScreen
        onSubmit={(kcal) => {
          if (uid) setGoal(db, uid, { kcal })
        }}
      />
    )
  }

  return <MainScreen />
}

// A quiet launch screen in the app's own colours while identity and the first
// Goal snapshot settle. It carries the resolved theme's background, so the
// hand-off is continuous — onboarding fades in over the same colour, the main
// screen takes over without a flash of unstyled or wrong-theme content.
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

import * as React from "react"

import { useTheme } from "@/components/theme-provider"
import { MainScreen } from "@/screens/main/MainScreen"

// Dev convenience: ?theme=dark|light forces the mode (shareable per-mode links,
// headless screenshots of both modes). The real theme setting arrives with #17.
function useThemeParam() {
  const { setTheme } = useTheme()
  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("theme")
    if (t === "dark" || t === "light") setTheme(t)
  }, [setTheme])
}

export function App() {
  useThemeParam()
  return <MainScreen />
}

export default App

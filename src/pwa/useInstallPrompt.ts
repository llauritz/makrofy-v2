import * as React from "react"

import { resolveInstallAffordance, type InstallAffordance } from "./install"

// The non-standard event Chromium fires when the app is installable. Capturing
// it (and calling preventDefault) is what lets us offer a *quiet* install entry
// instead of the browser's own mini-infobar (spec § PWA & offline).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const STANDALONE_QUERY = "(display-mode: standalone)"

function detectStandalone(): boolean {
  if (window.matchMedia(STANDALONE_QUERY).matches) {
    return true
  }
  // iOS home-screen apps don't report display-mode; they set navigator.standalone.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function detectIOS(): boolean {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) {
    return true
  }
  // iPadOS 13+ masquerades as desktop Safari; a touch-capable "Mac" is really an iPad.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
}

export type UseInstallPrompt = {
  affordance: InstallAffordance
  /**
   * Replays the captured native prompt (Chromium only). Resolves to the user's
   * choice, or "unavailable" if there was no prompt to replay.
   */
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">
}

export function useInstallPrompt(): UseInstallPrompt {
  const promptRef = React.useRef<BeforeInstallPromptEvent | null>(null)
  const [hasCapturedPrompt, setHasCapturedPrompt] = React.useState(false)
  const [isStandalone, setIsStandalone] = React.useState(detectStandalone)
  const [isIOS] = React.useState(detectIOS)

  React.useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress the default mini-infobar; we drive installation from Settings.
      event.preventDefault()
      promptRef.current = event as BeforeInstallPromptEvent
      setHasCapturedPrompt(true)
    }

    const onAppInstalled = () => {
      promptRef.current = null
      setHasCapturedPrompt(false)
      setIsStandalone(true)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    window.addEventListener("appinstalled", onAppInstalled)

    const displayModeQuery = window.matchMedia(STANDALONE_QUERY)
    const onDisplayModeChange = () => setIsStandalone(detectStandalone())
    displayModeQuery.addEventListener("change", onDisplayModeChange)

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onAppInstalled)
      displayModeQuery.removeEventListener("change", onDisplayModeChange)
    }
  }, [])

  const promptInstall = React.useCallback(async () => {
    const event = promptRef.current
    if (!event) {
      return "unavailable" as const
    }
    await event.prompt()
    const { outcome } = await event.userChoice
    // The captured event is single-use; drop it so the entry reflects reality.
    promptRef.current = null
    setHasCapturedPrompt(false)
    return outcome
  }, [])

  const affordance = resolveInstallAffordance({
    hasCapturedPrompt,
    isStandalone,
    isIOS,
  })

  return { affordance, promptInstall }
}

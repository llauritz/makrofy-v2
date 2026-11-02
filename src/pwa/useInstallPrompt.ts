import * as React from "react"

import { resolveInstallAffordance, type InstallAffordance } from "./install"
import {
  getInstallSnapshot,
  promptInstall,
  subscribeInstall,
} from "./install-store"

function detectIOS(): boolean {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) {
    return true
  }
  // iPadOS 13+ masquerades as desktop Safari; a touch-capable "Mac" is really an iPad.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
}

// Phones and tablets: a coarse pointer. The main-screen card is for them; a
// desktop browser can still install from Settings.
function detectTouch(): boolean {
  return window.matchMedia?.("(pointer: coarse)").matches ?? false
}

// ?install=android|ios fakes the environment, so both cards can be seen on a
// desktop browser or an already-installed phone. Dev server and PR preview
// channels only (goyaffle--pr110-….web.app), never on the live site.
function devOverride(): "android" | "ios" | null {
  const preview = /--pr\d+-/.test(window.location.hostname)
  if (!import.meta.env.DEV && !preview) return null
  const v = new URLSearchParams(window.location.search).get("install")
  return v === "android" || v === "ios" ? v : null
}

export type UseInstallPrompt = {
  affordance: InstallAffordance
  /** A phone or tablet, where the main-screen card may appear. */
  isTouch: boolean
  /**
   * Replays the captured native prompt (Chromium only). Resolves to the user's
   * choice, or "unavailable" if there was no prompt to replay.
   */
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">
}

export function useInstallPrompt(): UseInstallPrompt {
  const { hasCapturedPrompt, isStandalone } = React.useSyncExternalStore(
    subscribeInstall,
    getInstallSnapshot
  )
  const [env] = React.useState(() => {
    const dev = devOverride()
    return {
      dev,
      isIOS: dev ? dev === "ios" : detectIOS(),
      isTouch: dev ? true : detectTouch(),
    }
  })

  const affordance = resolveInstallAffordance({
    hasCapturedPrompt: hasCapturedPrompt || env.dev === "android",
    isStandalone,
    isIOS: env.isIOS,
  })

  return { affordance, isTouch: env.isTouch, promptInstall }
}

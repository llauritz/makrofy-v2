// The browser-side install facts, held once for the whole app.
//
// Chromium fires `beforeinstallprompt` once per page load, usually within the
// first seconds. A component that only starts listening when it mounts (the
// Settings row lives inside a sheet that mounts on open) misses it, so the
// event is captured here, from main.tsx, before React renders anything. The
// card on the main screen and the Settings row both read this one store.

// The non-standard event Chromium fires when the app is installable. Calling
// preventDefault() keeps the browser's own mini-infobar away; we offer the
// install ourselves, quietly.
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export type InstallSnapshot = {
  hasCapturedPrompt: boolean
  isStandalone: boolean
}

const STANDALONE_QUERY = "(display-mode: standalone)"

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false
  if (window.matchMedia?.(STANDALONE_QUERY).matches) return true
  // iOS home-screen apps don't report display-mode; they set navigator.standalone.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

let captured: BeforeInstallPromptEvent | null = null
let snapshot: InstallSnapshot = {
  hasCapturedPrompt: false,
  isStandalone: detectStandalone(),
}
const listeners = new Set<() => void>()
let started = false

function set(next: Partial<InstallSnapshot>) {
  const merged = { ...snapshot, ...next }
  if (
    merged.hasCapturedPrompt === snapshot.hasCapturedPrompt &&
    merged.isStandalone === snapshot.isStandalone
  )
    return
  snapshot = merged
  for (const l of listeners) l()
}

/** Start listening. Called once from main.tsx; later calls are no-ops. */
export function captureInstallPrompt() {
  if (started || typeof window === "undefined") return
  started = true

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    captured = event as BeforeInstallPromptEvent
    set({ hasCapturedPrompt: true })
  })

  window.addEventListener("appinstalled", () => {
    captured = null
    set({ hasCapturedPrompt: false, isStandalone: true })
  })

  window
    .matchMedia?.(STANDALONE_QUERY)
    .addEventListener?.("change", () =>
      set({ isStandalone: detectStandalone() })
    )
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getInstallSnapshot(): InstallSnapshot {
  return snapshot
}

/**
 * Replays the captured native prompt (Chromium only). Resolves to the user's
 * choice, or "unavailable" if there was no prompt to replay.
 */
export async function promptInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  const event = captured
  if (!event) return "unavailable"
  // The captured event is single-use; drop it before awaiting so a second tap
  // can't replay it.
  captured = null
  set({ hasCapturedPrompt: false })
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome
}

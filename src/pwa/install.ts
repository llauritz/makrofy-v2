// The pure decision behind the quiet "Install app" entry (spec § PWA & offline).
// Kept free of DOM globals so it is trivially testable; `useInstallPrompt`
// gathers the environment facts and calls this.

/** Facts about the current environment that decide the install affordance. */
export type InstallEnv = {
  /** A `beforeinstallprompt` event has been captured and can be replayed. */
  hasCapturedPrompt: boolean
  /** Already running as an installed PWA (display-mode standalone, or iOS standalone). */
  isStandalone: boolean
  /** iOS Safari — supports Add-to-Home-Screen but never fires `beforeinstallprompt`. */
  isIOS: boolean
}

export type InstallAffordance =
  /** Chromium: show a button that triggers the captured native prompt. */
  | "prompt"
  /** iOS Safari: show the Add-to-Home-Screen instruction sheet. */
  | "ios-guide"
  /** Already installed — hide the entry, never nag. */
  | "installed"
  /** Not installable here (yet) — hide the entry. */
  | "none"

export function resolveInstallAffordance(env: InstallEnv): InstallAffordance {
  // Installed always wins: an installed user is never shown an install entry.
  if (env.isStandalone) return "installed"
  // The native prompt is the best experience where it exists.
  if (env.hasCapturedPrompt) return "prompt"
  // iOS can't prompt; the manual Add-to-Home-Screen guide is the fallback.
  if (env.isIOS) return "ios-guide"
  return "none"
}

import { registerSW } from "virtual:pwa-register"

// Silent auto-update (spec § PWA & offline): no refresh prompt. A new deploy's
// shell is fetched and precached in the background; the empty `onNeedReload`
// replaces vite-plugin-pwa's default mid-session `location.reload()`, so the
// new shell takes over on the next open instead of interrupting a session
// (the prime directive: nothing interrupts logging food). Firestore and AI
// traffic are never cached (ADR 0001) — the SW owns static assets only.
export function registerServiceWorker() {
  registerSW({ immediate: true, onNeedReload() {} })
}

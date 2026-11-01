import { registerSW } from "virtual:pwa-register"

import { isNativeApp } from "@/native/platform"

// Silent auto-update (spec § PWA & offline): no refresh prompt. A new deploy's
// shell is fetched and precached in the background; the empty `onNeedReload`
// replaces vite-plugin-pwa's default mid-session `location.reload()`, so the
// new shell takes over on the next open instead of interrupting a session
// (the prime directive: nothing interrupts logging food). Firestore and AI
// traffic are never cached (ADR 0001) — the SW owns static assets only.
//
// Never in the Android app (ADR 0012): the APK already carries the shell, and a
// service worker there would only add a second, stale-able copy of it.
export function registerServiceWorker() {
  if (isNativeApp()) return
  registerSW({ immediate: true, onNeedReload() {} })
}

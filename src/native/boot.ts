import { isNativeApp } from "./platform"

/**
 * Hide the native splash once React has painted its first frame. The splash is
 * held (capacitor.config.ts, launchAutoHide: false) so the launch never shows a
 * blank WebView; with the boot mirror (ADR 0011) the first frame is one local
 * render, so this is ~a frame after JavaScript starts. No-op on the web.
 */
export function hideSplashAfterFirstPaint(): void {
  if (!isNativeApp()) return
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void import("@capacitor/splash-screen").then(({ SplashScreen }) =>
        SplashScreen.hide(),
      )
    })
  })
}

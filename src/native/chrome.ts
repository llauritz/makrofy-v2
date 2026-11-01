import { registerPlugin } from "@capacitor/core"

import { isNativeApp } from "./platform"

// SystemChromePlugin in android/app/src/main/java/com/goyaffle/app/SystemChrome.kt.
interface SystemChromePlugin {
  setTheme(options: { color: string; dark: boolean }): Promise<void>
}

const SystemChrome = registerPlugin<SystemChromePlugin>("SystemChrome")

/**
 * Paint Android's status and navigation bars in the app's background colour,
 * with light or dark icons to match — what Chrome does for the installed PWA
 * from the theme-color meta. Called whenever the resolved theme changes; the
 * native side remembers it for the next launch. No-op on the web.
 */
export function setSystemBarsTheme(color: string, dark: boolean): void {
  if (!isNativeApp()) return
  SystemChrome.setTheme({ color, dark }).catch((err: unknown) => {
    console.error("Could not theme the system bars", err)
  })
}

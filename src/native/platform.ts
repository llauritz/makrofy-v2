// The one place the web app asks whether it is running inside the Android
// shell (ADR 0012). Screens never check the platform themselves: they call the
// typed wrappers in src/native/, which are no-ops on the web.
import { Capacitor } from "@capacitor/core"

/** True inside the Capacitor Android app, false in any browser or test. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

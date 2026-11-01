import type { CapacitorConfig } from "@capacitor/cli"

// The Android app is this web app inside a Capacitor shell (ADR 0012). The Vite
// build in dist/ is copied into the APK, so the app shell never loads from the
// network: launch paints from the bundled files plus the boot mirror (ADR 0011)
// and Firestore's IndexedDB cache (ADR 0001).
const config: CapacitorConfig = {
  appId: "com.goyaffle.app",
  appName: "Yaffle",
  webDir: "dist",
  android: {
    // Release builds must not be debuggable over chrome://inspect.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    // MainActivity keeps the WebView between the status and navigation bars
    // and paints the bars in the theme colour, so the app looks exactly like
    // the installed PWA (src/native/chrome.ts). Capacitor's own inset handling
    // is off so the two never fight.
    SystemBars: {
      insetsHandling: "disable",
    },
    SplashScreen: {
      // Held until React's first paint (src/native/boot.ts), never longer:
      // the boot mirror makes that one local frame.
      launchAutoHide: false,
      launchFadeOutDuration: 150,
      showSpinner: false,
    },
    SocialLogin: {
      // Only Google is compiled in; Apple, Facebook and Twitter stay out of
      // the APK.
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
  },
}

export default config

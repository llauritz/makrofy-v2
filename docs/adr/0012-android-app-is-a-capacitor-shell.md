---
status: accepted
---

# The Android app is the web app in a Capacitor shell

Yaffle needs an Android app: Health Connect, a home screen widget and local
reminders all need native code the PWA can't reach. It must keep full feature
parity with the web app, look identical, launch instantly, and be buildable
without Android Studio (debug APKs on a phone, a signed bundle for the Play
Console).

> **The Android app is the Vite build inside a Capacitor shell** (`android/`,
> `capacitor.config.ts`). Every screen stays in `src/`; native Kotlin exists
> only where Android requires it (system bars, and later reminders, Health
> Connect and the widget), always behind a typed wrapper in `src/native/` that
> is a no-op on the web. GitHub Actions builds the APK with the Gradle wrapper.

## Considered Options

- **Native Kotlin/Compose rewrite** — rejected: two UIs to keep identical
  forever, every feature implemented twice, and the data layer (ADR 0001's
  Firestore cache, ADR 0011's boot mirror) re-done in another SDK.
- **Trusted Web Activity (the PWA in Chrome)** — rejected: no way to add the
  widget, Health Connect or reliable local notifications next to it.
- **React Native** — rejected: the UI is DOM and Tailwind; a port is a
  rewrite in all but name.
- **Monorepo split (web and android packages)** — rejected: there is one app;
  Capacitor's root-level `android/` folder next to `src/` is enough.

## How the shell keeps the web app's guarantees

- **Instant launch, offline.** The Vite build is copied into the APK; nothing
  of the shell loads from the network, so the service worker is skipped
  (`src/pwa/register.ts`). Data still comes only from the Firestore cache and
  the boot mirror. The native splash is held until React's first frame and no
  longer (`src/native/boot.ts`).
- **Same look.** The WebView sits between the status and navigation bars,
  which are painted in the theme colour (`SystemChrome.kt`,
  `src/native/chrome.ts`) — what Chrome does for the installed PWA. The web
  layout needs no Android-only safe-area code.
- **Same origin.** The bundle is served as `https://goyaffle.web.app` inside the
  WebView (`server.hostname`), so App Check's reCAPTCHA Enterprise key, which
  attests by domain, accepts the app; requests to that host are answered from
  the APK and never reach the network.
- **Google sign-in.** Firebase's redirect flow can't run in a WebView. The
  system account picker (Credential Manager, via
  `@capgo/capacitor-social-login`) returns a Google ID token for the Firebase
  project's web client, and `linkGoogleIdToken` links it onto the Guest or
  union-merges on a collision — the same rules as ADR 0002. It needs the app's
  signing certificates registered in Firebase (`docs/android.md`).
- **Back.** The hardware back button closes the innermost open thing (sheet,
  focused field, full screen) and only then minimises the app
  (`src/native/back.ts`).

## Consequences

- Android-only behaviour is reachable only through `src/native/`; screens
  never check the platform.
- A committed debug keystore gives every CI debug APK the same signature, so
  builds install over each other and one SHA-1 serves Google sign-in. Release
  builds are signed with an upload key from repository secrets.
- `minSdk` is 26 (Health Connect's floor); Kotlin is set up for the native
  features that follow.

# Android app

The Android app is this web app inside a Capacitor shell (ADR 0012). There is
no Android Studio step: GitHub Actions builds it, and you install the result.

## Get a debug APK onto your phone

1. Every PR and every push to `main` runs the **Android** workflow. Open the
   run (Actions tab, or the PR's checks) and download the `yaffle-debug-apk`
   artifact. It is a zip holding `yaffle-debug.apk`.
2. Install it, either:
   - with USB debugging on: `adb install -r yaffle-debug.apk`, or
   - by opening the APK on the phone (allow installs from your browser or
     file manager when Android asks).

Every debug build is signed with the same committed key
(`android/app/debug.keystore`), so a new build installs over the last one and
keeps its data.

## One-time Firebase setup for Google sign-in

Native Google sign-in needs Android's signing certificates registered in the
`goyaffle` Firebase project. Until this is done, everything else works and the
sign-in row shows "Couldn't sign in with Google".

1. Firebase console → Project settings → Your apps → **Add app → Android**.
   Package name: `com.goyaffle.app`. No `google-services.json` is needed in the
   repo; you can skip that download.
2. In that Android app, **Add fingerprint** for each certificate:
   - Debug (CI builds), SHA-1:
     `7F:78:F1:37:64:DC:58:33:5C:CE:A6:8C:4D:AB:AE:57:E2:D9:60:36`
   - Your release upload key's SHA-1 (`keytool -list -v -keystore upload.jks`).
   - Once the app is in the Play Console: the **app signing key** SHA-1 from
     Play Console → Test and release → App integrity.
3. Google sign-in must stay enabled under Authentication → Sign-in method
   (it already is for the web app).

The app asks Credential Manager for a token for the project's existing web
OAuth client (`src/native/google-sign-in.ts`), which Firebase accepts.

## Release signing

The **Android release** workflow (Actions → Android release → Run workflow)
builds a signed `.aab` for the Play Console and a signed `.apk`. It reads four
repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | `base64 -w0 upload.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | the key alias, e.g. `upload` |
| `ANDROID_KEY_PASSWORD` | the key password |

Create the upload key once and keep it safe outside the repo:

```bash
keytool -genkeypair -v -keystore upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

`versionCode` is the release workflow's run number, so each run can be
uploaded to Play; `versionName` is `package.json`'s `version`.

## Building locally (optional)

With JDK 21 and the Android SDK installed (`ANDROID_HOME` set):

```bash
pnpm build
pnpm exec cap sync android
cd android && ./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`.

## Where things live

- `capacitor.config.ts` — app id, served hostname, splash and plugin config.
- `android/app/src/main/java/com/goyaffle/app/` — Kotlin: `MainActivity`
  (registers local plugins, keeps the WebView between the system bars) and
  `SystemChrome` (bar colours).
- `android/app/src/main/java/com/goyaffle/app/widget/` — the home screen
  widget (ADR 0014): a Jetpack Glance widget in two picker sizes (2×2 ring,
  4×2 summary card) that paints only the snapshot the web app hands it
  (`src/native/widget-snapshot.ts`, kept fresh by `src/native/WidgetSync.tsx`).
  Its fonts in `res/font` are static, Latin-subset cuts of the app's Public
  Sans, Nunito and Fraunces.
- `src/native/` — the typed TypeScript side of every native feature, no-ops on
  the web. Screens import from here and never check the platform themselves.
- `android/app/src/main/res/` — icons and splash, drawn from the same brand Y
  path as the PWA icons.

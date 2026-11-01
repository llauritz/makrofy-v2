# Yaffle

A mobile-first, easy-above-all calorie and macro tracker. The domain language
is in `CONTEXT.md`, decisions in `docs/adr/`.

- Web app: Vite + React, deployed to Firebase Hosting. `pnpm dev` runs it
  against the local emulators.
- Android app: the same web app in a Capacitor shell, built by GitHub Actions.
  See `docs/android.md`.

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { LanguageProvider } from "@/components/language-provider.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { startBootMirror } from "@/data/boot-mirror"
import { bootstrapIdentity } from "@/data/identity"
import { auth, db } from "@/lib/firebase"
import { registerServiceWorker } from "@/pwa/register"

// Guests get a real Firebase identity from first launch (ADR 0002); a Google
// sign-in redirect (if one is pending) is finished first — it may union-merge a
// second device into an existing account and switch us to it (#19). Nothing
// downstream waits on this; the data layer queues writes regardless.
void bootstrapIdentity(auth, db)

// Keep the boot mirror fresh so the next launch paints without waiting for
// auth to settle (issue #69). The hooks seed from it in src/data/hooks.ts.
startBootMirror(auth, db)

// Precache the app shell and keep it silently up to date (spec § PWA & offline).
registerServiceWorker()

if (import.meta.env.DEV) {
  void import("@/lib/dev-console").then(({ exposeDevConsole }) =>
    exposeDevConsole(auth, db),
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>
)

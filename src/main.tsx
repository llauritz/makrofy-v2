import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { LanguageProvider } from "@/components/language-provider.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { ensureIdentity } from "@/data/identity"
import { auth, db } from "@/lib/firebase"
import { registerServiceWorker } from "@/pwa/register"

// Guests get a real Firebase identity from first launch (ADR 0002); nothing
// downstream waits on it — the data layer queues writes regardless.
void ensureIdentity(auth)

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

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { ensureIdentity } from "@/data/identity"
import { auth, db } from "@/lib/firebase"

// Guests get a real Firebase identity from first launch (ADR 0002); nothing
// downstream waits on it — the data layer queues writes regardless.
void ensureIdentity(auth)

if (import.meta.env.DEV) {
  void import("@/lib/dev-console").then(({ exposeDevConsole }) =>
    exposeDevConsole(auth, db),
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)

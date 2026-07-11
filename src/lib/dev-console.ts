// Dev-only console handle: the data layer has no UI yet (#14), so integration
// checks and manual poking drive it through window.__makrofy in the browser
// console. Never part of a production bundle.
import type { Auth } from "firebase/auth"
import type { Firestore } from "firebase/firestore"

declare global {
  interface Window {
    __makrofy?: Record<string, unknown>
  }
}

export async function exposeDevConsole(auth: Auth, db: Firestore): Promise<void> {
  const [entries, goal, identity] = await Promise.all([
    import("@/data/entries"),
    import("@/data/goal"),
    import("@/data/identity"),
  ])
  window.__makrofy = { auth, db, ...entries, ...goal, ...identity }
}

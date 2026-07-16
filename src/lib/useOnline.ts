import * as React from "react"

/**
 * Whether the browser believes it has a connection. Feeds the ✨ button's
 * offline dimming (spec § AI macro-fill) — an optimistic signal only, so the
 * AI path still handles a failed call; everything else in the app works
 * offline through the Firestore cache and never consults this.
 */
export function useOnline(): boolean {
  const [online, setOnline] = React.useState(() => navigator.onLine)
  React.useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener("online", up)
    window.addEventListener("offline", down)
    return () => {
      window.removeEventListener("online", up)
      window.removeEventListener("offline", down)
    }
  }, [])
  return online
}

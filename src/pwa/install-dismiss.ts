// The install card's ✕, remembered on this device like the theme and
// language. Storage can be absent or fenced off (private mode): reads fall
// back to "not dismissed" and writes fail silently, so the card at worst
// comes back on the next launch.
const KEY = "yaffle:install-card:v1"

export function readInstallCardDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "dismissed"
  } catch {
    return false
  }
}

export function writeInstallCardDismissed(): void {
  try {
    localStorage.setItem(KEY, "dismissed")
  } catch {
    // Nothing to do: the in-memory state still hides it for this session.
  }
}

// The static launch splash in index.html (#boot-splash): plain markup that
// paints before the app's script has loaded. React never renders into it.

const ID = "boot-splash"

/** Whether the static splash is on screen (present and not hidden). */
export function bootSplashShowing(): boolean {
  const el = document.getElementById(ID)
  return el !== null && getComputedStyle(el).display !== "none"
}

/** Remove the static splash for good. Safe to call repeatedly. */
export function dismissBootSplash(): void {
  document.getElementById(ID)?.remove()
}

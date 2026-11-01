import * as React from "react"

import { isNativeApp } from "./platform"

// The Android back button (and back gesture). Each press closes the innermost
// thing that is open, the way back works in any Android app, and only leaves
// the app from the main screen:
//
//   1. an open sheet (every bottom sheet is a Base UI dialog) closes;
//   2. a focused field (the add card, an inline entry editor) gets Escape —
//      the same key a keyboard user presses to back out of it — and blurs;
//   3. a full screen (Glossary, stats) returns to the screen that opened it;
//   4. otherwise the app goes to the background — minimised, not finished,
//      so coming back is instant.

type BackHandler = () => void

// Screens register in mount order, so the last one is the innermost.
const screenHandlers: BackHandler[] = []

/**
 * Register what back does while a full screen is showing. Pass null when the
 * screen has nothing to go back to. No-op on the web, where the browser owns
 * back.
 */
export function useBackHandler(handler: BackHandler | null): void {
  const latest = React.useRef(handler)
  React.useEffect(() => {
    latest.current = handler
  })
  const active = handler !== null
  React.useEffect(() => {
    if (!active) return undefined
    const entry: BackHandler = () => latest.current?.()
    screenHandlers.push(entry)
    return () => {
      const i = screenHandlers.lastIndexOf(entry)
      if (i !== -1) screenHandlers.splice(i, 1)
    }
  }, [active])
}

function pressEscape(target: Element): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  )
}

function isEditable(el: Element | null): el is HTMLElement {
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable || el.matches("input, textarea, select"))
  )
}

/** One back press, as described above. Returns false when nothing was left to close. */
export function handleBack(doc: Document = document): boolean {
  const dialogs = doc.querySelectorAll('[role="dialog"], [role="alertdialog"]')
  if (dialogs.length > 0) {
    // Base UI closes its topmost dialog on Escape.
    pressEscape(doc.activeElement ?? doc.body)
    return true
  }
  const focused = doc.activeElement
  if (isEditable(focused)) {
    pressEscape(focused)
    focused.blur()
    return true
  }
  const screen = screenHandlers.at(-1)
  if (screen) {
    screen()
    return true
  }
  return false
}

/** Wire the hardware back button. Call once at startup; no-op on the web. */
export function startBackButton(): void {
  if (!isNativeApp()) return
  void import("@capacitor/app").then(({ App }) =>
    App.addListener("backButton", () => {
      if (!handleBack()) void App.minimizeApp()
    }),
  )
}

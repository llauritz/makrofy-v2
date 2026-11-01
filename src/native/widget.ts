// The typed seam to the Android home screen widget (android/…/widget). The
// widget is the app's one piece of native UI: it paints only the snapshot the
// app hands it here (src/native/widget-snapshot.ts) and opens the app when
// tapped. Everywhere but the Android app every call is a no-op, so screens use
// this module freely and never check the platform themselves.
import { Capacitor, registerPlugin } from "@capacitor/core"

import { isNativeApp } from "./platform"
import type { WidgetSnapshot } from "./widget-snapshot"

/** What a widget tap asks of the app: show today, or show today ready to add. */
export type WidgetAction = "today" | "add"

interface YaffleWidgetPlugin {
  /** Store the snapshot natively and repaint every placed widget. */
  update(options: { snapshot: string }): Promise<void>
  /** Raise the soft keyboard for the focused field (WebView won't on focus()). */
  showKeyboard(): Promise<void>
  addListener(
    event: "widgetAction",
    listener: (data: { action: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>
}

const PLUGIN = "YaffleWidget"

const plugin = registerPlugin<YaffleWidgetPlugin>(PLUGIN)

/** True only inside the Android app, where the widget exists. */
export const widgetSupported =
  isNativeApp() && Capacitor.isPluginAvailable(PLUGIN)

// The last snapshot handed over, so an unchanged repaint (a listener
// re-delivering the same data, a re-render) costs nothing.
let lastSent: string | null = null

/**
 * Hand the widget a fresh snapshot. Fire-and-forget: the widget repaints in
 * the background and a failure just leaves it on the previous snapshot.
 */
export function pushWidgetSnapshot(snapshot: WidgetSnapshot): void {
  if (!widgetSupported) return
  const json = JSON.stringify(snapshot)
  if (json === lastSent) return
  lastSent = json
  plugin.update({ snapshot: json }).catch((err: unknown) => {
    lastSent = null
    console.error("Widget update failed", err)
  })
}

// Widget taps fan out to two kinds of subscriber: watchers (the app's screen
// switch) see every tap, and handlers (the main screen) act on it. A tap that
// arrives while no handler is mounted — the splash is up on a cold start, or
// another screen is showing — waits here for the next handler to subscribe,
// so it is acted on exactly once, never lost to launch timing.
type TapListener = (action: WidgetAction) => void
const watchers = new Set<TapListener>()
const handlers = new Set<TapListener>()
let waiting: WidgetAction | null = null

function deliver(action: WidgetAction) {
  for (const watch of watchers) watch(action)
  if (handlers.size === 0) {
    waiting = action
    return
  }
  waiting = null
  for (const handle of handlers) handle(action)
}

// One native subscription for the app's lifetime. A tap that cold-started the
// app is held natively until this subscribes.
if (widgetSupported) {
  void plugin.addListener("widgetAction", ({ action }) => {
    if (action === "today" || action === "add") deliver(action)
  })
}

/** See every widget tap without acting on it (e.g. to switch screens). */
export function watchWidgetTaps(listener: TapListener): () => void {
  watchers.add(listener)
  return () => {
    watchers.delete(listener)
  }
}

/**
 * Act on widget taps, including one that arrived before this subscribed. The
 * waiting tap is handed over on the next microtask, from outside the caller's
 * effect, and only if this subscription is still live by then — so a StrictMode
 * remount acts on it once.
 */
export function handleWidgetTaps(handler: TapListener): () => void {
  handlers.add(handler)
  if (waiting) {
    queueMicrotask(() => {
      if (!waiting || !handlers.has(handler)) return
      const action = waiting
      waiting = null
      handler(action)
    })
  }
  return () => {
    handlers.delete(handler)
  }
}

/** Show the soft keyboard after focusing a field from code (Android only). */
export function showSoftKeyboard(): void {
  if (!widgetSupported) return
  plugin.showKeyboard().catch(() => {})
}

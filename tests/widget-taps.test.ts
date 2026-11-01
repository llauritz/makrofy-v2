// Seam: home screen widget taps reaching the app (src/native/widget.ts). A
// tap can arrive before anything is listening — it cold-started the app and
// the splash is still up — and must then be acted on exactly once, by the
// first main screen to mount, even through a StrictMode remount.
import { beforeEach, describe, expect, it, vi } from "vitest"

type NativeListener = (data: { action: string }) => void
const native = vi.hoisted(() => ({ listener: null as NativeListener | null }))

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true },
  registerPlugin: () => ({
    addListener: (_event: string, listener: NativeListener) => {
      native.listener = listener
      return Promise.resolve({ remove: () => Promise.resolve() })
    },
    update: () => Promise.resolve(),
    showKeyboard: () => Promise.resolve(),
  }),
}))

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve))

async function load() {
  vi.resetModules()
  native.listener = null
  return import("@/native/widget")
}

describe("widget taps", () => {
  beforeEach(() => {
    native.listener = null
  })

  it("holds a tap until a handler subscribes, then hands it over once", async () => {
    const { handleWidgetTaps } = await load()
    native.listener!({ action: "add" })

    const first = vi.fn()
    handleWidgetTaps(first)
    await flush()
    expect(first).toHaveBeenCalledExactlyOnceWith("add")

    const second = vi.fn()
    handleWidgetTaps(second)
    await flush()
    expect(second).not.toHaveBeenCalled()
  })

  it("survives a StrictMode subscribe–unsubscribe–subscribe", async () => {
    const { handleWidgetTaps } = await load()
    native.listener!({ action: "today" })

    const handler = vi.fn()
    const stop = handleWidgetTaps(handler)
    stop()
    handleWidgetTaps(handler)
    await flush()
    expect(handler).toHaveBeenCalledExactlyOnceWith("today")
  })

  it("shows every tap to watchers and ignores unknown actions", async () => {
    const { handleWidgetTaps, watchWidgetTaps } = await load()
    const watcher = vi.fn()
    const handler = vi.fn()
    watchWidgetTaps(watcher)
    handleWidgetTaps(handler)

    native.listener!({ action: "today" })
    native.listener!({ action: "nonsense" })
    native.listener!({ action: "add" })
    expect(watcher.mock.calls).toEqual([["today"], ["add"]])
    expect(handler.mock.calls).toEqual([["today"], ["add"]])
  })
})

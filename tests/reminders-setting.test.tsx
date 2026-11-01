// @vitest-environment jsdom
// Seam: the reminders settings section (ADR 0013), rendered for real with the
// native bridge stubbed. Pins the permission flow — asked for only when the
// switch goes on, a refusal keeps it off and explains — and that the section
// vanishes off Android.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { LanguageProvider } from "@/components/language-provider"
import {
  readReminderSettings,
  resetReminderSettingsCache,
} from "@/data/reminder-settings"

const native = vi.hoisted(() => ({
  available: true,
  permission: "granted" as "granted" | "denied" | "prompt",
  requested: 0,
}))

vi.mock("@/native/reminders", () => ({
  remindersAvailable: () => native.available,
  checkReminderPermission: async () => native.permission,
  requestReminderPermission: async () => {
    native.requested++
    return native.permission
  },
}))

const { RemindersSetting } = await import("@/screens/settings/RemindersSetting")

beforeAll(() => {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
})

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem("language", "en")
  resetReminderSettingsCache()
  native.available = true
  native.permission = "granted"
  native.requested = 0
})
afterEach(cleanup)

const renderSection = () =>
  render(
    <LanguageProvider>
      <RemindersSetting />
    </LanguageProvider>,
  )

describe("RemindersSetting", () => {
  it("renders nothing off Android", () => {
    native.available = false
    const { container } = renderSection()
    expect(container.innerHTML).toBe("")
  })

  it("starts off, asks for permission on switch-on, then shows the times", async () => {
    renderSection()
    const toggle = screen.getByRole("switch", { name: /Remind me to log/ })
    expect(toggle.getAttribute("aria-checked")).toBe("false")
    expect(screen.queryByLabelText(/Reminder 1 time/)).toBeNull()
    expect(native.requested).toBe(0)

    fireEvent.click(toggle)
    await waitFor(() => expect(readReminderSettings().enabled).toBe(true))
    expect(native.requested).toBe(1)
    expect(
      screen.getAllByLabelText(/Reminder \d time/).map((i) => (i as HTMLInputElement).value),
    ).toEqual(["08:30", "13:00", "19:30"])
  })

  it("stays off and explains when permission is refused", async () => {
    native.permission = "denied"
    renderSection()
    fireEvent.click(screen.getByRole("switch", { name: /Remind me to log/ }))
    await screen.findByText(/Notifications are off for Yaffle/)
    expect(readReminderSettings().enabled).toBe(false)
  })

  it("adds, edits and removes times", async () => {
    localStorage.setItem(
      "yaffle:reminders:v1",
      JSON.stringify({ enabled: true, times: ["08:30"], smartSkip: true }),
    )
    resetReminderSettingsCache()
    renderSection()

    fireEvent.click(screen.getByRole("button", { name: "Add reminder" }))
    expect(readReminderSettings().times).toEqual(["08:30", "09:30"])

    fireEvent.change(screen.getByLabelText("Reminder 2 time"), {
      target: { value: "20:15" },
    })
    expect(readReminderSettings().times).toEqual(["08:30", "20:15"])

    fireEvent.click(screen.getAllByRole("button", { name: "Remove reminder" })[0])
    expect(readReminderSettings().times).toEqual(["20:15"])
  })
})

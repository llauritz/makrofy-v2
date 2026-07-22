// @vitest-environment jsdom
// Seam: MainScreen's observable day-navigation flows (#34) — the calendar
// bottom sheet and the off-strip state. The Firestore-backed data hooks are
// stubbed at their module boundary (the external system); everything below
// MainScreen renders for real, so these tests survive refactors of the strip,
// the sheet, and the wiring between them.
import { Timestamp } from "firebase/firestore"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { LanguageProvider } from "@/components/language-provider"
import type { Entry } from "@/data/entries"
import {
  localDay,
  monthOf,
  monthTitle,
  shortDayLabel,
  stepDay,
  stepMonth,
} from "@/lib/day"

// Entries the useDay stub serves, keyed by Day. Hoisted so the mock factory
// below (which vitest lifts above the imports) can close over it.
const dayLog = vi.hoisted(() => new Map<string, unknown[]>())

vi.mock("@/lib/firebase", () => ({ app: {}, db: {}, auth: {} }))
vi.mock("@/data/identity", () => ({ refreshIdentity: vi.fn() }))
vi.mock("@/data/hooks", () => ({
  useIdentity: () => "test-uid",
  useDay: (_uid: string, day: string) => dayLog.get(day) ?? [],
  useCoverage: () => null,
  useGoal: () => ({ kcal: 2000 }),
  useLoggedDays: () => new Set<string>(),
  useProductIndex: () => ({ products: new Map(), totalEntries: 0 }),
  useSyncStatus: () => "synced",
  // The morning strip's feeds (#22): an empty history keeps it hidden, so day
  // navigation is exercised without the strip in the tree.
  useAllEntries: () => [],
  useCoverageRange: () => new Map(),
}))

import { MainScreen } from "@/screens/main/MainScreen"

// Every screen reads the active language through useI18n → useLanguage, so the
// component tree needs a LanguageProvider (jsdom's navigator resolves to en,
// which is what the English label assertions below expect).
function renderMain() {
  return render(
    <LanguageProvider>
      <MainScreen onOpenGlossary={() => {}} onOpenStats={() => {}} />
    </LanguageProvider>
  )
}

// The moving parts of "now", computed exactly once for the whole file.
const TODAY = localDay(new Date())
// The 15th of last month: at least 16 days back, so always off-strip.
const TARGET = `${stepMonth(monthOf(TODAY), -1)}-15`

function entry(date: string, label: string): Entry {
  return {
    id: `e-${label}`,
    date,
    label,
    kcal: 300,
    mealType: "breakfast",
    source: "manual",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }
}

beforeAll(() => {
  // jsdom offers none of these; the strip's auto-scroll, FadeSwap's height
  // measuring and motion's reduced-motion probe all degrade gracefully with
  // inert stand-ins. Reduced motion reads as ON so the header's wordmark
  // (#79) never pulls the real Lottie player into a jsdom run.
  Element.prototype.scrollIntoView = () => {}
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  dayLog.clear()
})

const calendarButton = () =>
  screen.getByRole("button", { name: /open calendar/i })

function openSheet() {
  fireEvent.click(calendarButton())
  return screen.getByRole("dialog")
}

/** One horizontal log-swipe; positive dx reveals the previous Day. */
function swipe(surface: Element, dx: number) {
  fireEvent.pointerDown(surface, { clientX: 200, clientY: 300 })
  fireEvent.pointerUp(surface, { clientX: 200 + dx, clientY: 300 })
}

describe("MainScreen day navigation (#34)", () => {
  it("selects a calendar pick, closes the sheet, and lands on that Day's log", () => {
    dayLog.set(TARGET, [entry(TARGET, "Porridge")])
    renderMain()

    // On-strip, the button is a plain calendar affordance, no date on show.
    expect(calendarButton().getAttribute("aria-label")).toBe("Open calendar")

    const sheet = openSheet()
    // The sheet opens on the selected Day's month.
    expect(within(sheet).getByText(monthTitle(monthOf(TODAY)))).toBeTruthy()

    fireEvent.click(
      within(sheet).getByRole("button", { name: "Previous month" })
    )
    expect(
      within(sheet).getByText(monthTitle(stepMonth(monthOf(TODAY), -1)))
    ).toBeTruthy()

    fireEvent.click(within(sheet).getByLabelText(TARGET))

    // Picking selects and closes: the sheet is gone, the picked Day's log is
    // on screen, no strip chip is current, and the button carries the date.
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByText("Porridge")).toBeTruthy()
    expect(document.querySelector('[aria-current="date"]')).toBeNull()
    expect(calendarButton().getAttribute("aria-label")).toBe(
      `Open calendar, ${shortDayLabel(TARGET)}`
    )
  })

  it("reopens from the off-strip button and returns home via today", () => {
    renderMain()

    let sheet = openSheet()
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Previous month" })
    )
    fireEvent.click(within(sheet).getByLabelText(TARGET))

    // Off-strip: the date-bearing button reopens the picker on that month,
    // with the selection emphasized in the grid.
    sheet = openSheet()
    expect(within(sheet).getByText(monthTitle(monthOf(TARGET)))).toBeTruthy()
    expect(
      within(sheet).getByLabelText(TARGET).getAttribute("aria-current")
    ).toBe("date")

    fireEvent.click(within(sheet).getByRole("button", { name: "Next month" }))
    fireEvent.click(within(sheet).getByLabelText(TODAY))

    // Home again: sheet closed, today's chip selected, the date label gone.
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(calendarButton().getAttribute("aria-label")).toBe("Open calendar")
    const current = document.querySelectorAll('[aria-current="date"]')
    expect(current).toHaveLength(1)
    expect(current[0].getAttribute("aria-label")).toBe(TODAY)
  })

  it("lets the swipe drift past the old 14-day floor into the off-strip state", () => {
    const { container } = renderMain()
    const surface = container.querySelector(".touch-pan-y")!

    for (let i = 0; i < 15; i++) swipe(surface, 120)

    const landed = stepDay(TODAY, -15)
    expect(document.querySelector('[aria-current="date"]')).toBeNull()
    expect(calendarButton().getAttribute("aria-label")).toBe(
      `Open calendar, ${shortDayLabel(landed)}`
    )
  })

  it("switches Day when swiping the empty space below the log", () => {
    const { container } = renderMain()
    // The flex spacer that soaks up the gap between the log and the footer is
    // the "empty space" a user drags on. It must lie inside the swipe surface,
    // not beside it, or the gesture dies wherever the content stops.
    const empty = container.querySelectorAll('[class="flex-1"]')
    expect(empty).toHaveLength(1)

    for (let i = 0; i < 15; i++) swipe(empty[0], 120)

    const landed = stepDay(TODAY, -15)
    expect(document.querySelector('[aria-current="date"]')).toBeNull()
    expect(calendarButton().getAttribute("aria-label")).toBe(
      `Open calendar, ${shortDayLabel(landed)}`
    )
  })
})

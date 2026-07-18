// @vitest-environment jsdom
// Seam: the Coverage control (issue #42) — the Some / Most / Everything chips
// under a Day's Entry list. Rendered for real; the gate's clock logic is
// pinned in coverage.test.ts, so these drive the chip behaviour on a closed
// (past) Day, where the control shows regardless of the clock.
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { LanguageProvider } from "@/components/language-provider"
import type { CoverageLevel } from "@/data/days"
import { CoverageControl } from "@/screens/main/CoverageControl"

beforeAll(() => {
  // jsdom lacks matchMedia; motion's reduced-motion probe degrades gracefully.
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

afterEach(cleanup)

const PAST_DAY = "2026-01-05" // long closed, whatever today is

function renderControl(
  props: Partial<{
    day: string
    entryCount: number
    level: CoverageLevel | null
    onSelect: (level: CoverageLevel) => void
  }> = {},
) {
  return render(
    <LanguageProvider>
      <CoverageControl
        day={props.day ?? PAST_DAY}
        entryCount={props.entryCount ?? 2}
        level={props.level ?? null}
        onSelect={props.onSelect ?? (() => {})}
      />
    </LanguageProvider>,
  )
}

describe("CoverageControl", () => {
  it("offers the three levels on a closed Day holding Entries", () => {
    renderControl()
    expect(screen.getByRole("button", { name: "Some" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Most" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Everything" })).toBeTruthy()
  })

  it("renders nothing for an empty Day", () => {
    renderControl({ entryCount: 0 })
    expect(screen.queryByRole("button", { name: "Some" })).toBeNull()
  })

  it("renders nothing for a future Day", () => {
    renderControl({ day: "2999-01-01" })
    expect(screen.queryByRole("button", { name: "Some" })).toBeNull()
  })

  it("reports the tapped level", () => {
    const onSelect = vi.fn()
    renderControl({ onSelect })
    fireEvent.click(screen.getByRole("button", { name: "Most" }))
    expect(onSelect).toHaveBeenCalledWith("most")
  })

  it("marks only the stored label as pressed", () => {
    renderControl({ level: "most" })
    expect(
      screen.getByRole("button", { name: "Most" }).getAttribute("aria-pressed"),
    ).toBe("true")
    expect(
      screen.getByRole("button", { name: "Some" }).getAttribute("aria-pressed"),
    ).toBe("false")
  })
})

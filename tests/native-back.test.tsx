// @vitest-environment jsdom
// Seam: the Android back button (src/native/back.ts). Each press closes the
// innermost open thing — a sheet, then a focused field, then a full screen —
// and only reports "nothing left" on the main screen, where the shell
// minimises the app. Exercised through handleBack directly; the Capacitor
// listener that calls it is a one-liner.
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { handleBack, useBackHandler } from "@/native/back"

function Screen({ onBack }: { onBack: (() => void) | null }) {
  useBackHandler(onBack)
  return null
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
})

describe("Android back", () => {
  it("does nothing on the main screen, so the app is minimised", () => {
    render(<Screen onBack={null} />)
    expect(handleBack()).toBe(false)
  })

  it("returns from a full screen to the one that opened it", () => {
    const onBack = vi.fn()
    render(<Screen onBack={onBack} />)
    expect(handleBack()).toBe(true)
    expect(onBack).toHaveBeenCalledOnce()
  })

  it("closes an open sheet before leaving the screen", () => {
    const onBack = vi.fn()
    const escapes = vi.fn()
    render(<Screen onBack={onBack} />)
    const sheet = document.createElement("div")
    sheet.setAttribute("role", "dialog")
    document.body.appendChild(sheet)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") escapes()
    })

    expect(handleBack()).toBe(true)
    expect(escapes).toHaveBeenCalledOnce()
    expect(onBack).not.toHaveBeenCalled()
  })

  it("backs out of a focused field with Escape and blurs it", () => {
    const onKeyDown = vi.fn()
    render(<input aria-label="label" onKeyDown={(e) => onKeyDown(e.key)} />)
    const input = document.querySelector("input")!
    input.focus()

    expect(handleBack()).toBe(true)
    expect(onKeyDown).toHaveBeenCalledWith("Escape")
    expect(document.activeElement).not.toBe(input)
  })

  it("unregisters a screen's handler when it unmounts", () => {
    const onBack = vi.fn()
    const { unmount } = render(<Screen onBack={onBack} />)
    unmount()
    expect(handleBack()).toBe(false)
  })
})

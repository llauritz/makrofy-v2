// Seam: the first-run gate (src/screens/onboarding/gate.ts). Which of the three
// top-level views the app shows — a splash while things settle, the onboarding
// goal screen for a fresh profile, or the main screen — from just the identity
// and the Goal's load status. Kept pure so the "no onboarding flash for a
// returning user" rule (spec § Onboarding; cross-cutting: no layout jumps) is
// pinned without a browser.
import { describe, expect, it } from "vitest"

import { resolveAppView } from "@/screens/onboarding/gate"

describe("resolveAppView", () => {
  it("waits (splash) until the Guest identity has resolved", () => {
    // No uid yet: nothing is decidable, and we must not offer onboarding before
    // there is a uid to write the Goal against.
    expect(resolveAppView(null, "loading")).toBe("loading")
    expect(resolveAppView(null, "unset")).toBe("loading")
    expect(resolveAppView(null, "set")).toBe("loading")
  })

  it("waits (splash) while the Goal is still loading", () => {
    // Identity is ready but we haven't heard from the Goal listener yet —
    // showing either screen now risks a flash when the real answer arrives.
    expect(resolveAppView("uid-1", "loading")).toBe("loading")
  })

  it("shows onboarding when the profile has no Goal yet", () => {
    expect(resolveAppView("uid-1", "unset")).toBe("onboarding")
  })

  it("shows the main screen once a Goal exists", () => {
    expect(resolveAppView("uid-1", "set")).toBe("main")
  })
})

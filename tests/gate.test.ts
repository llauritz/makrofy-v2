// Seam: the first-run gate (src/screens/onboarding/gate.ts). Which of the three
// top-level views the app shows — a splash while things settle, onboarding for
// a fresh profile, or the main screen — from the identity, the Goal's load
// status and whether the profile has logged anything. Kept pure so the "no
// onboarding flash for a returning user" rule (spec § Onboarding;
// cross-cutting: no layout jumps) is pinned without a browser.
import { describe, expect, it } from "vitest"

import { resolveAppView } from "@/screens/onboarding/gate"

describe("resolveAppView", () => {
  it("waits (splash) until the Guest identity has resolved", () => {
    // No uid yet: nothing is decidable, and we must not offer onboarding before
    // there is a uid to write the Goal against.
    expect(resolveAppView(null, "loading", "loading")).toBe("loading")
    expect(resolveAppView(null, "unset", "none")).toBe("loading")
    expect(resolveAppView(null, "set", "some")).toBe("loading")
  })

  it("waits (splash) while the Goal is still loading", () => {
    // Identity is ready but we haven't heard from the Goal listener yet —
    // showing either screen now risks a flash when the real answer arrives.
    expect(resolveAppView("uid-1", "loading", "none")).toBe("loading")
  })

  it("shows the main screen once a Goal exists, whatever the Entries", () => {
    expect(resolveAppView("uid-1", "set", "loading")).toBe("main")
    expect(resolveAppView("uid-1", "set", "none")).toBe("main")
  })

  it("waits (splash) on a Goal-less profile until we know if it has logged", () => {
    expect(resolveAppView("uid-1", "unset", "loading")).toBe("loading")
  })

  it("shows onboarding only to a profile with no Goal and no Entries", () => {
    expect(resolveAppView("uid-1", "unset", "none")).toBe("onboarding")
  })

  it("sends a Goal-less profile that already logged to the main screen", () => {
    // Logged while onboarding was parked (#35): past first run already.
    expect(resolveAppView("uid-1", "unset", "some")).toBe("main")
  })

  describe("on a fresh device (never held a profile)", () => {
    it("shows onboarding at once instead of waiting on sign-in and the server", () => {
      expect(resolveAppView(null, "loading", "loading", true)).toBe("onboarding")
      expect(resolveAppView("uid-1", "loading", "loading", true)).toBe(
        "onboarding",
      )
      expect(resolveAppView("uid-1", "unset", "loading", true)).toBe(
        "onboarding",
      )
    })

    it("still lets the real answer win once it arrives", () => {
      // e.g. a Google sign-in from Welcome brings a synced Goal or history.
      expect(resolveAppView("uid-1", "set", "loading", true)).toBe("main")
      expect(resolveAppView("uid-1", "unset", "some", true)).toBe("main")
      expect(resolveAppView("uid-1", "unset", "none", true)).toBe("onboarding")
    })
  })
})

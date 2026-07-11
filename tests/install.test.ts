import { describe, expect, it } from "vitest"

import { resolveInstallAffordance, type InstallEnv } from "@/pwa/install"

// The install entry is quiet (spec § PWA & offline): it only appears where it
// can actually do something, and never once the app is already installed.
const base: InstallEnv = {
  hasCapturedPrompt: false,
  isStandalone: false,
  isIOS: false,
}

describe("resolveInstallAffordance", () => {
  it("offers the native prompt when Chromium has captured beforeinstallprompt", () => {
    expect(
      resolveInstallAffordance({ ...base, hasCapturedPrompt: true }),
    ).toBe("prompt")
  })

  it("offers the iOS Add-to-Home-Screen guide on iOS Safari", () => {
    expect(resolveInstallAffordance({ ...base, isIOS: true })).toBe(
      "ios-guide",
    )
  })

  it("hides the entry when there is nothing installable to offer", () => {
    expect(resolveInstallAffordance(base)).toBe("none")
  })

  it("hides the entry once the app is already installed (standalone)", () => {
    expect(resolveInstallAffordance({ ...base, isStandalone: true })).toBe(
      "installed",
    )
  })

  it("treats standalone as installed even with a captured prompt", () => {
    // An installed PWA can still receive beforeinstallprompt in some browsers;
    // being installed always wins so we never nag an installed user.
    expect(
      resolveInstallAffordance({
        ...base,
        isStandalone: true,
        hasCapturedPrompt: true,
      }),
    ).toBe("installed")
  })

  it("treats standalone as installed even on iOS", () => {
    // iOS home-screen apps report standalone; don't show the A2HS guide there.
    expect(
      resolveInstallAffordance({ ...base, isStandalone: true, isIOS: true }),
    ).toBe("installed")
  })

  it("prefers the native prompt over the iOS guide when both somehow apply", () => {
    // Chromium never runs on iOS, but pin the precedence so the rule is total.
    expect(
      resolveInstallAffordance({
        ...base,
        hasCapturedPrompt: true,
        isIOS: true,
      }),
    ).toBe("prompt")
  })
})

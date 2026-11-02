// @vitest-environment jsdom
// Seam: PaywallProvider's tree around the main screen. The plan and fill
// count arrive a moment into the launch; when they did, the provider used to
// wrap the screen in an extra context, which React treats as a new tree: the
// whole main screen unmounted and mounted again (the wordmark intro replayed
// and the launch looked like a reload). The screen must mount exactly once.
// The subscription hook and billing switch are stubbed at their modules.
import { act, cleanup, render } from "@testing-library/react"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  sub: null as unknown,
  setSub: null as ((v: unknown) => void) | null,
}))

vi.mock("@/lib/firebase", () => ({ app: {}, db: {}, auth: { currentUser: null } }))
vi.mock("@/data/hooks", () => ({
  useIdentity: () => "u1",
  useAuthUser: () => null,
}))
vi.mock("@/screens/paywall/switch", () => ({
  billingSwitch: () => ({ enabled: true, showNotice: false }),
}))
vi.mock("@/screens/paywall/useSubscription", async () => {
  const React = await import("react")
  return {
    useSubscriptionState: () => {
      const [sub, setSub] = React.useState(state.sub)
      state.setSub = setSub
      return sub
    },
  }
})

import { LanguageProvider } from "@/components/language-provider"
import { PaywallProvider, usePaywall } from "@/screens/paywall/Paywall"

afterEach(() => {
  cleanup()
  state.sub = null
})

describe("PaywallProvider", () => {
  it("keeps the screen mounted when the plan state arrives", () => {
    let mounts = 0
    const seen: Array<boolean> = []
    function Screen() {
      React.useEffect(() => {
        mounts++
      }, [])
      seen.push(usePaywall() !== null)
      return null
    }
    render(
      <LanguageProvider>
        <PaywallProvider>
          <Screen />
        </PaywallProvider>
      </LanguageProvider>,
    )
    expect(mounts).toBe(1)
    act(() =>
      state.setSub!({
        entitlement: null,
        cycle: {
          plan: "free",
          used: 10,
          limit: 10,
          remaining: 0,
          resetsOn: new Date("2026-11-20T00:00:00Z"),
        },
        cycleId: "c1",
        usage: { fills: 10, calls: 10, grounded: 0 },
      }),
    )
    expect(seen.at(-1)).toBe(true)
    expect(mounts).toBe(1)
  })
})

// Seam: the subscription ladder's arithmetic (src/data/plans) and the paywall
// switch (src/screens/paywall/switch). The prices and limits
// are #58's decisions; what's worth pinning is the derived numbers the paywall
// prints — a per-month or saving figure that rounds up would overstate a claim.
import { describe, expect, it } from "vitest"

import { aiCycle, annualSavingPct, perMonth, PRICE_USD } from "@/data/plans"
import { readBillingSwitch } from "@/screens/paywall/switch"

describe("plan arithmetic", () => {
  it("shows annual prices per month rounded down to the cent", () => {
    expect(perMonth(PRICE_USD.pro.annual)).toBe(2.49)
    expect(perMonth(PRICE_USD.unlimited.annual)).toBe(6.66)
  })

  it("never overstates the annual saving", () => {
    expect(annualSavingPct("pro")).toBe(37)
    expect(annualSavingPct("unlimited")).toBe(33)
  })

  it("clamps what's left at zero", () => {
    const resetsOn = new Date(2026, 10, 13)
    expect(aiCycle("free", 12, resetsOn)).toMatchObject({
      limit: 10,
      remaining: 0,
    })
    expect(aiCycle("pro", 188, resetsOn).remaining).toBe(812)
  })
})

describe("readBillingSwitch", () => {
  it("stays off in the sandbox without ?paywall", () => {
    expect(readBillingSwitch("", false, "sandbox").enabled).toBe(false)
    expect(readBillingSwitch("?theme=dark", false, "sandbox").enabled).toBe(false)
  })

  it("turns on with ?paywall, and stays on for the tab", () => {
    expect(readBillingSwitch("?paywall", false, "sandbox").enabled).toBe(true)
    expect(readBillingSwitch("", true, "sandbox").enabled).toBe(true)
  })

  it("is on for everyone once Paddle runs in production", () => {
    expect(readBillingSwitch("", false, "production").enabled).toBe(true)
  })

  it("reads the notice switch", () => {
    expect(readBillingSwitch("?paywall=notice", false, "sandbox").showNotice).toBe(true)
    expect(readBillingSwitch("?paywall", false, "sandbox").showNotice).toBe(false)
  })
})

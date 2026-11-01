// Seam: the subscription ladder's arithmetic (src/data/plans) and the paywall
// prototype's URL switch (src/screens/paywall/preview). The prices and limits
// are #58's decisions; what's worth pinning is the derived numbers the paywall
// prints — a per-month or saving figure that rounds up would overstate a claim.
import { describe, expect, it } from "vitest"

import { aiCycle, annualSavingPct, perMonth, PRICE_USD } from "@/data/plans"
import { readPaywallPreview } from "@/screens/paywall/preview"

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

describe("readPaywallPreview", () => {
  const today = new Date(2026, 10, 1)

  it("stays off without ?paywall", () => {
    expect(readPaywallPreview("", today)).toBeNull()
    expect(readPaywallPreview("?theme=dark", today)).toBeNull()
  })

  it("defaults to a part-used free plan resetting 12 days out", () => {
    const preview = readPaywallPreview("?paywall", today)
    expect(preview?.cycle).toMatchObject({
      plan: "free",
      used: 7,
      remaining: 3,
    })
    expect(preview?.cycle.resetsOn).toEqual(new Date(2026, 10, 13))
    expect(preview?.showNotice).toBe(false)
  })

  it("reads plan, usage and the notice switch", () => {
    expect(
      readPaywallPreview("?paywall&plan=pro&used=all", today)?.cycle
    ).toMatchObject({ plan: "pro", used: 1000, remaining: 0 })
    expect(readPaywallPreview("?paywall&used=99", today)?.cycle.used).toBe(10)
    expect(readPaywallPreview("?paywall=notice", today)?.showNotice).toBe(true)
  })
})

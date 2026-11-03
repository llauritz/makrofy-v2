// Seam: who is offered the statistics dashboard (Nov 2026: Pro and
// Unlimited only, while the feature is reworked).
import { describe, expect, it } from "vitest"

import { statsAvailable } from "@/screens/stats/access"

describe("statsAvailable", () => {
  it("offers the dashboard to Pro and Unlimited", () => {
    expect(statsAvailable("pro")).toBe(true)
    expect(statsAvailable("unlimited")).toBe(true)
  })

  it("hides it from Free", () => {
    expect(statsAvailable("free")).toBe(false)
  })

  it("hides it while the plan is still loading", () => {
    expect(statsAvailable(null)).toBe(false)
    expect(statsAvailable(undefined)).toBe(false)
  })
})

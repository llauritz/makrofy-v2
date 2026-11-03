// The subscription ladder as decided in the wayfinder map (#58): three plans,
// one dimension — how many ✨ AI fills a plan allows per fixed 30-day cycle
// (#64; limits from the Nov 2026 price review). Pure constants and arithmetic,
// no Firebase, so the paywall's numbers stay testable and there is exactly one
// place a price or limit is written.
//
// Prices are build-locked by #60 (Scenario B) behind the pre-launch
// queries-per-fill re-verify gate; USD only for now — the per-currency charm
// table (GBP/EUR) lands with checkout (#66).

import { CYCLE_LIMIT } from "../../functions/src/ai-allowance"

export type Plan = "free" | "pro" | "unlimited"
export type Billing = "annual" | "monthly"

// The allowance itself — limits, cycle length and cycle maths — lives with the
// aiFill function that enforces it (ADR 0016); the app only shows it.
export {
  CYCLE_DAYS,
  CYCLE_LIMIT,
  cycleWindow,
} from "../../functions/src/ai-allowance"

/** Sticker prices in USD, tax-inclusive display (#60). */
export const PRICE_USD: Record<
  Exclude<Plan, "free">,
  Record<Billing, number>
> = {
  pro: { monthly: 3.99, annual: 29.99 },
  unlimited: { monthly: 9.99, annual: 79.99 },
}

/** An annual price expressed per month, rounded down to the cent ($29.99 → $2.49). */
export function perMonth(annual: number): number {
  return Math.floor((annual / 12) * 100) / 100
}

/**
 * Whole-percent saving of paying annually over twelve monthly payments,
 * rounded down so the claim is never overstated ($29.99 vs 12 × $3.99 → 37).
 */
export function annualSavingPct(paid: Exclude<Plan, "free">): number {
  const { monthly, annual } = PRICE_USD[paid]
  return Math.floor((1 - annual / (monthly * 12)) * 100)
}

/** Where a user stands in the current cycle — the shape #64's listener returns. */
export type AiCycle = {
  plan: Plan
  used: number
  limit: number
  remaining: number
  resetsOn: Date
}

export function aiCycle(plan: Plan, used: number, resetsOn: Date): AiCycle {
  const limit = CYCLE_LIMIT[plan]
  return {
    plan,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsOn,
  }
}

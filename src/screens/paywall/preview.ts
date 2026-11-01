import { aiCycle, CYCLE_LIMIT, type AiCycle, type Plan } from "@/data/plans"

// The paywall prototype's switch (#65). Nothing about plans exists in the data
// layer yet — the entitlement doc (#63) and the 30-day usage cycle (#64) are
// still ahead on the build backlog — so the prototype runs on a hand-made
// cycle read from the URL, and every paywall surface stays dark without it:
//
//   ?paywall                  free plan, 7 of 10 tries used
//   ?paywall&plan=pro     Pro, 188 of 1,000 used
//   ?paywall&plan=unlimited         Unlimited
//   ?paywall&used=all         any plan, exhausted (the next ✨ shows the refusal)
//   ?paywall&used=3           any count, clamped to the plan's limit
//   ?paywall=notice           also opens the one-time "plans are here" notice
//
// When #63/#64 land, this module is replaced by the real `onSnapshot` cycle
// and the surfaces keep their props.

const DEFAULT_USED: Record<Plan, number> = { free: 7, pro: 188, unlimited: 230 }

/** What the prototype URL asks for, or null when the paywall is switched off. */
export type PaywallPreview = { cycle: AiCycle; showNotice: boolean }

export function readPaywallPreview(
  search: string,
  today: Date = new Date()
): PaywallPreview | null {
  const params = new URLSearchParams(search)
  if (!params.has("paywall")) return null

  const planParam = params.get("plan")
  const plan: Plan =
    planParam === "pro" || planParam === "unlimited" ? planParam : "free"
  const usedParam = params.get("used")
  const asked = usedParam === "all" ? CYCLE_LIMIT[plan] : Number(usedParam)
  const used =
    usedParam !== null && usedParam !== "" && Number.isFinite(asked)
      ? Math.min(Math.max(0, Math.round(asked)), CYCLE_LIMIT[plan])
      : DEFAULT_USED[plan]
  // A cycle part-way through: resets twelve days out.
  const resetsOn = new Date(today)
  resetsOn.setDate(resetsOn.getDate() + 12)

  return {
    cycle: aiCycle(plan, used, resetsOn),
    showNotice: params.get("paywall") === "notice",
  }
}

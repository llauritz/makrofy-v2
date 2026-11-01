import {
  PADDLE,
  type PaddleEnvironment,
} from "../../../functions/src/paddle-config"

// Whether the plans and the cycle limit are switched on. They are for everyone
// once Paddle runs in production (go-live, docs/runbooks/paddle.md). Until then
// they stay dark except behind ?paywall, which is how the sandbox checkout is
// tried on the live site and on PR previews; the flag sticks for the tab, so
// a Google sign-in redirect on the way to checkout doesn't drop it.
//
//   ?paywall          plans, fill counter and sandbox checkout switched on
//   ?paywall=notice   also opens the one-time "plans are here" notice

export type BillingSwitch = { enabled: boolean; showNotice: boolean }

export function readBillingSwitch(
  search: string,
  remembered: boolean,
  environment: PaddleEnvironment = PADDLE.environment
): BillingSwitch {
  const params = new URLSearchParams(search)
  return {
    enabled:
      environment === "production" || params.has("paywall") || remembered,
    showNotice: params.get("paywall") === "notice",
  }
}

const KEY = "yaffle.paywall"

/** The switch for this page load, remembering a ?paywall for the tab. */
export function billingSwitch(): BillingSwitch {
  let remembered = false
  try {
    remembered = sessionStorage.getItem(KEY) === "1"
  } catch {
    // storage blocked: the URL alone decides
  }
  const result = readBillingSwitch(window.location.search, remembered)
  if (result.enabled && PADDLE.environment !== "production") {
    try {
      sessionStorage.setItem(KEY, "1")
    } catch {
      // as above
    }
  }
  return result
}

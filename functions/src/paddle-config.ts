// Paddle's public settings, shared by the app (checkout) and the functions
// (webhook, portal, plan change). Everything here is public by design: the
// client-side token ships in the app bundle and price IDs appear in every
// checkout. The two real secrets — the API key and the notification
// destination's secret — live in Google Secret Manager, never in the repo
// (docs/runbooks/paddle.md).
//
// Going live means swapping this whole block for the live account's values in
// one commit: environment "production", the `live_` client token, and the
// live price IDs — plus the live API key and notification secret in Secret
// Manager. Ask the owner first; it starts taking real money.

export type PaddleEnvironment = "sandbox" | "production"
export type PaidPlan = "pro" | "unlimited"
export type Billing = "monthly" | "annual"

export const PADDLE = {
  environment: "production" as PaddleEnvironment,
  /** Developer tools → Authentication → client-side token (`live_…`). */
  clientToken: "live_5ac501d20644d8a0463e3477735",
  /** Catalog → Products → each price's `pri_…` ID. */
  prices: {
    pro: {
      monthly: "pri_01m6fayjav39sdk2n4w36dw61y",
      annual: "pri_01m6fayjj79kfdep37w194jtpd",
    },
    unlimited: {
      monthly: "pri_01m6fayk7p8pz0rn54wqfxa4b9",
      annual: "pri_01m6faykffkvff2dt6022x7n1t",
    },
  } satisfies Record<PaidPlan, Record<Billing, string>>,
}

/** True once the token and all four price IDs are filled in. */
export function paddleConfigured(): boolean {
  return (
    PADDLE.clientToken !== "" &&
    Object.values(PADDLE.prices).every(
      (p) => p.monthly !== "" && p.annual !== ""
    )
  )
}

/** The plan and billing a price ID sells, or null for a price we don't know. */
export function planForPrice(
  priceId: string
): { plan: PaidPlan; billing: Billing } | null {
  for (const plan of ["pro", "unlimited"] as const) {
    for (const billing of ["monthly", "annual"] as const) {
      if (PADDLE.prices[plan][billing] === priceId) return { plan, billing }
    }
  }
  return null
}

export function paddleApiBase(): string {
  return PADDLE.environment === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com"
}

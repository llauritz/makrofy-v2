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
  environment: "sandbox" as PaddleEnvironment,
  /** Developer tools → Authentication → client-side token (`test_…` in sandbox). */
  clientToken: "test_d292176a394d113e02eebc2ea74",
  /** Catalog → Products → each price's `pri_…` ID. */
  prices: {
    pro: {
      monthly: "pri_01m6ceh25d7h9bp0jt8xcgpgps",
      annual: "pri_01m6cejvkeejbjbk6gp2df7h5e",
    },
    unlimited: {
      monthly: "pri_01m6cempnar24g4q89fn84d4yc",
      annual: "pri_01m6cenng71r8m8ecshy3mwrce",
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

import { paddleApiBase } from "./paddle-config.js"

// The two Paddle API calls the app needs, over plain fetch: a customer portal
// session (manage, cancel, card) and a plan change on an existing
// subscription. The API key needs only subscription.read, subscription.write
// and customer_portal_session.write.

async function paddle<T>(
  apiKey: string,
  method: "POST" | "PATCH",
  path: string,
  body: unknown
): Promise<T> {
  const res = await fetch(`${paddleApiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as {
    data?: T
    error?: { code?: string; detail?: string }
  } | null
  if (!res.ok || !json?.data) {
    throw new Error(
      `Paddle ${method} ${path} failed: ${res.status} ${json?.error?.code ?? ""} ${json?.error?.detail ?? ""}`.trim()
    )
  }
  return json.data
}

/** A short-lived link into Paddle's customer portal, opened on the subscription. */
export async function createPortalLink(
  apiKey: string,
  customerId: string,
  subscriptionId: string | null
): Promise<string> {
  const data = await paddle<{
    urls: {
      general: { overview: string }
      subscriptions?: Array<{ id: string; view_subscription?: string }>
    }
  }>(apiKey, "POST", `/customers/${customerId}/portal-sessions`, {
    subscription_ids: subscriptionId ? [subscriptionId] : [],
  })
  return (
    data.urls.subscriptions?.find((s) => s.id === subscriptionId)
      ?.view_subscription ?? data.urls.general.overview
  )
}

/**
 * Move a subscription onto another price, charging or crediting the
 * difference now, and keep it running if a cancellation was scheduled.
 * Returns the updated subscription entity.
 */
export async function changeSubscriptionPrice<T>(
  apiKey: string,
  subscriptionId: string,
  priceId: string
): Promise<T> {
  return paddle<T>(apiKey, "PATCH", `/subscriptions/${subscriptionId}`, {
    items: [{ price_id: priceId, quantity: 1 }],
    proration_billing_mode: "prorated_immediately",
    // Choosing a plan means staying: drop a pending end-of-period cancel.
    scheduled_change: null,
  })
}

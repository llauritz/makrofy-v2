import { paddleApiBase } from "./paddle-config.js"

// The Paddle API calls the app needs, over plain fetch: a customer portal
// session (card, invoices, cancel), and a plan change on an existing
// subscription with its preview. The API key needs only subscription.read, subscription.write
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

/** The update a plan change sends; the preview sends the same. */
function priceChange(priceId: string) {
  return {
    items: [{ price_id: priceId, quantity: 1 }],
    proration_billing_mode: "prorated_immediately",
    // Choosing a plan means staying: drop a pending end-of-period cancel.
    scheduled_change: null,
  }
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
  return paddle<T>(
    apiKey,
    "PATCH",
    `/subscriptions/${subscriptionId}`,
    priceChange(priceId)
  )
}

/** What a plan change would charge or credit now, without making it. */
export interface ChangePreview {
  /** "charge": paid now; "credit": kept towards later payments. */
  action: "charge" | "credit" | null
  /** In the currency's minor unit (cents), as Paddle reports it. */
  amount: number
  currency: string
}

export async function previewSubscriptionPrice(
  apiKey: string,
  subscriptionId: string,
  priceId: string
): Promise<ChangePreview> {
  const data = await paddle<{
    currency_code?: string
    update_summary?: {
      result?: { action?: string; amount?: string; currency_code?: string }
    } | null
  }>(
    apiKey,
    "PATCH",
    `/subscriptions/${subscriptionId}/preview`,
    priceChange(priceId)
  )
  const result = data.update_summary?.result
  const action =
    result?.action === "charge" || result?.action === "credit"
      ? result.action
      : null
  return {
    action,
    amount: Number(result?.amount ?? 0) || 0,
    currency: result?.currency_code ?? data.currency_code ?? "USD",
  }
}

---
status: accepted
---

# The plan lives in one server-written doc; Paddle's webhook is its only writer

Resolves [#63](https://github.com/llauritz/makrofy-v2/issues/63) with the
provider fixed by #61 (Paddle, Merchant of Record) and the shape from §3 of
`docs/research/subscription-gating.md`. The first server code in the repo
(`functions/`, Blaze plan) is the accepted entry fee; ADR 0001 stands — the
app still reads everything through the Firestore SDK.

> **The entitlement doc** `/users/{uid}/settings/subscription`:
> `{ plan, billing, status, provider, customerId, subscriptionId,
> planStartedAt, currentPeriodEnd, cancelsAt, eventAt, updatedAt }`.
> No doc means Free. Written only by `functions/` (Admin SDK); the rules let
> the owner read it and refuse every client write.

## Decisions

- **One writer.** The `paddleWebhook` function verifies `Paddle-Signature`
  (HMAC-SHA256 over `ts:rawBody` with the destination's secret), then applies
  `subscription.*` events in a transaction that also records the event id
  under `/paddleEvents/{id}` — a redelivery is applied once, and the log is the
  audit trail. Events older than the last applied one are ignored (Paddle
  doesn't promise order). `paddleChangePlan` applies Paddle's reply through the
  same code, so the webhook's echo is a no-op.
- **More than one subscription.** Each subscription's latest state is kept
  under `/paddleSubscriptions/{id}` (server-only, like `/paddleEvents`), and
  the entitlement follows the best one still paying: highest plan, then
  newest. Cancelling one of two (two checkouts on two devices) leaves the plan
  of the other, which is still charging. Staleness is judged per subscription.
  (Added Nov 2026 after the second sandbox sweep caught the user dropping to
  Free.)
- **Identity through checkout, never email.** The overlay checkout passes
  `customData: { uid }`; Paddle copies it onto the subscription, and the
  webhook addresses `/users/{uid}` with it. A subscription without a uid is
  logged as an error and acknowledged — there is nothing a retry could fix.
- **Purchases need a Google-linked account** (ADR 0002 link-in-place), so a
  plan never strands on a Guest uid that a union merge would abandon. The
  callables refuse anonymous callers too.
- **Status → plan.** `active`, `trialing` and `past_due` keep the paid plan
  (Paddle retries a failed card for a while; cutting a payer off on the first
  decline is hostile). `canceled` and `paused` mean Free. A cancel scheduled
  for the period end keeps the plan and fills `cancelsAt`.
- **`planStartedAt` moves only on a purchase, an upgrade, a lapse to free or
  a resubscribe.** Renewals, a monthly ↔ yearly switch, a downgrade, and a
  pause with its resume keep it (owner's call, Nov 2026: a downgrade from
  Unlimited must not hand out a fresh Pro allowance). ADR 0013 anchors the AI
  cycle on it, and because only the server writes it, a tamperer can't mint
  fresh cycles.
- **Offline grace: 7 days past `currentPeriodEnd`.** Every renewal moves the
  date forward, so the grace only bites when the app hasn't synced across a
  renewal for a week — and lifts the moment it does.
- **A paying user changes plan in place** (`paddleChangePlan`, prorated
  immediately, any scheduled cancel dropped). A second checkout would open a
  second subscription.
- **Manage = Paddle's customer portal** (`paddlePortal` returns a short-lived
  link). Cancel, card, invoices and refunds stay on Paddle's side.
- **No custom claim yet.** Nothing in the rules gates on plan today, and the
  doc has no token-refresh lag. Add `setCustomUserClaims` in the webhook the day
  a rule needs it.
- **Merge semantics.** The union merge (ADR 0002/0006) never copies
  `settings/subscription` — it couldn't under the rules anyway. Signing into
  account B on a device where A paid shows B's plan; the subscription still
  belongs to A's Paddle customer.

## Config and secrets

Public values (client-side token, price IDs, environment) live in
`functions/src/paddle-config.ts`, imported by both the app and the functions.
The API key and the notification secret live in Google Secret Manager as
`PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET`. Setup and go-live steps:
`docs/runbooks/paddle.md`.

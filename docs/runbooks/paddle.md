# Paddle: setup, testing and go-live

How Yaffle's subscriptions are wired (ADR 0012, ADR 0013) and the steps that
happen outside the code. Everything starts in Paddle's **sandbox**, which is a
separate Paddle account from the live one and never moves real money.

## What lives where

| Value | Secret? | Where it goes |
|---|---|---|
| Environment (`sandbox` / `production`) | no | `functions/src/paddle-config.ts` |
| Client-side token (`test_…` / `live_…`) | no, ships in the app | `functions/src/paddle-config.ts` |
| Four price IDs (`pri_…`) | no | `functions/src/paddle-config.ts` |
| API key | **yes** | Secret Manager: `PADDLE_API_KEY` |
| Notification destination secret (`pdl_ntfset_…`) | **yes** | Secret Manager: `PADDLE_WEBHOOK_SECRET` |

Secrets never go in the repo, in chat, or in a GitHub secret. Set them from the
repo folder; the CLI asks for the value with hidden input:

```sh
npx firebase functions:secrets:set PADDLE_API_KEY
npx firebase functions:secrets:set PADDLE_WEBHOOK_SECRET
```

A function reads the secret version current at deploy time, so redeploy the
functions after changing one.

## One-time setup (sandbox)

1. **Firebase:** the project must be on the Blaze plan (Cloud Functions and
   Secret Manager need it). Set a budget alert while you're there.
2. **Paddle sandbox account:** sign up at https://sandbox-login.paddle.com/signup.
3. **Catalog → Products:**
   - *Yaffle Pro*: US$3.99 every month, US$29.99 every year.
   - *Yaffle Unlimited*: US$9.99 every month, US$79.99 every year.
   - Tax category *Standard digital goods*; tax mode *inclusive* (#60: VAT
     absorbed, tax-inclusive display). GBP/EUR charm prices can be added as
     price overrides later.
4. **Checkout → Checkout settings:** default payment link
   `https://yaffleapp.com/`.
5. **Settings → Authentication** (API keys and client-side tokens):
   - a *client-side token* → `clientToken` in `paddle-config.ts`;
   - an *API key* with `subscription.read`, `subscription.write` and
     `customer_portal_session.write` → `PADDLE_API_KEY`.
6. **Events → Notifications → New destination** (usage type *Platform*):
   - URL `https://us-central1-goyaffle.cloudfunctions.net/paddleWebhook`
   - events: `subscription.created`, `.updated`, `.activated`, `.canceled`,
     `.past_due`, `.paused`, `.resumed`, `.trialing`
   - its secret key → `PADDLE_WEBHOOK_SECRET`. Paddle shows it when the
     destination is saved and may not show it again; if it's lost, delete the
     destination and make a new one.
7. **Deploy** the functions and the rules (CI deploys hosting only):

   ```sh
   pnpm install
   npx firebase deploy --only functions,firestore:rules
   ```

## Testing in the sandbox

Billing stays dark on the live site until go-live. Add `?paywall` to the URL
(it sticks for the tab) to switch on the plans, the fill counter and the
sandbox checkout: `https://yaffleapp.com/?paywall`.

- Sign in with Google, open Settings → Upgrade, pick a plan, and pay with
  Paddle's test card `4242 4242 4242 4242`, any future expiry, CVC `100`.
- Within a few seconds Settings shows the plan. The webhook log is in the
  Firebase console (Functions → `paddleWebhook` → Logs) and every event is
  recorded under `/paddleEvents` in Firestore, with each subscription's
  latest state under `/paddleSubscriptions`.
- *Manage* opens Paddle's customer portal: cancel there and the plan shows
  "ends …"; cancel immediately from the Paddle dashboard and it drops to Free.
- From Pro, run out of fills (or use *Get Unlimited*) to test the in-place
  plan change.
- Paddle's dashboard can replay any event (Notifications → the event →
  Replay) — a replay is applied once.

Local development: `pnpm dev` runs the Auth and Firestore emulators only. To
try the callables locally, run
`npx firebase emulators:start --only functions` alongside it.

## Go-live checklist

Ask the owner before any of this — it starts taking real money.

1. Paddle **live** account verified, payout method set, and the domain
   `yaffleapp.com` approved (Paddle reviews `/pricing`, `/terms`,
   `/privacy`, `/refunds`). Also add `goyaffle.web.app`, which still serves
   the app for people who used it there before the move (ADR 0015); if Paddle
   won't approve it, checkout only works on yaffleapp.com.
2. Recreate the products and prices, the client-side token, the API key and
   the notification destination in the live account.
3. Replace the two secrets with the live values (commands above).
4. In `paddle-config.ts`: `environment: "production"`, the `live_` token and
   the live price IDs. This also switches billing on for everyone
   (`src/screens/paywall/switch.ts`).
5. Deploy functions and rules, then merge the config change (hosting deploys
   on merge).
6. Lower Firebase AI Logic's per-user rate limit to 20 RPM (ADR 0013).
7. Decide when the one-time "plans are here" notice shows to existing users.

## Refunds

Refunds are issued in the Paddle dashboard. The policy (`/refunds`): within
14 days of a payment, if fewer than 100 AI fills were used since it. To check,
read the user's `/users/{uid}/aiCycles` docs in the Firestore console — `fills`
per 30-day cycle. A full refund that cancels the subscription moves the user to
Free through the webhook.

# Subscription System for Gating AI Usage & Future Premium Features — Research Note

_Scope: feeds the design decision for adding a simple subscription to Makrofy V2 that gates AI macro-fill (and future premium features) behind a paid plan. Covers: what the codebase gives us today, the 2026 pricing-model landscape for AI-flavoured consumer apps, payment-provider options (Stripe direct, the Stripe Firebase Extension, merchants of record, RevenueCat), where entitlement state should live on a Firebase-only stack, and how enforceable each level of gating actually is. Researched 2026-07-17 against primary docs plus current comparison coverage; prices/fees/statuses verified on that date and will drift._

---

## TL;DR / Recommendations

- **Any *enforceable* paywall requires Makrofy's first server-side code.** The app is a client-only SPA (ADR 0001); the only server-side authorization anywhere is `firestore.rules`. Every payment provider needs a webhook target to tell us "this user paid", and a webhook target is a server. Minimum viable server: **one Cloud Function (Blaze plan)** that receives provider webhooks and writes an entitlement document. This is unavoidable; plan for it rather than around it.
- **Provider: use a Merchant of Record (MoR), not raw Stripe.** As a UK business selling a digital service to consumers, EU VAT is owed **from the first EU sale, no threshold** ([Stripe EU VAT guide](https://stripe.com/guides/introduction-to-eu-vat-and-european-vat-oss)) — with raw Stripe you'd carry UK + EU (+ eventually US state) tax registration and filing yourself. An MoR resells the subscription and absorbs all of that. Shortlist: **Paddle** (5% + $0.50, most mature tax coverage) or **Polar** (4% + $0.40, best developer experience, younger company). At a ~£25–35/yr consumer price point the ~2.5-point fee premium over raw Stripe is roughly **£1/subscriber/year** — trivially worth the compliance it buys. Stripe's own MoR (Managed Payments, from the Lemon Squeezy acquisition) is in public preview but costs **3.5% on top of** normal Stripe fees (~6.4%+ all-in) — the most expensive option, skip.
- **Do not adopt the "Run Payments with Stripe" Firebase extension.** The GitHub repository (`invertase/stripe-firebase-extensions`) shows **archived June 18, 2026 — read-only, "no further updates, bug fixes, or support"**. Its architecture (webhook → Firestore sync → `stripeRole` custom claim) is exactly the right *pattern* to copy by hand, but taking a dependency on an unmaintained extension for the money path is the wrong trade. _(Verify the archive status once more before finalising — the repo carries older transfer notices that make the timeline easy to misread.)_
- **Entitlement state lives in Firestore, written only by the server.** A single doc — `/users/{uid}/settings/subscription` (or a `plan` field folded into an entitlements doc) — written exclusively by the webhook Cloud Function via the Admin SDK, with a rules carve-out so the client can read but never write it. This keeps the SDK-is-the-store model (ADR 0001): the client gets realtime + offline-cached entitlement for free. Optionally mirror the plan into a **custom claim** for cheap checks inside security rules; know that claims only propagate on ID-token refresh (up to ~1 h unless forced).
- **Guests can't buy. Require Google sign-in at the moment of purchase.** ADR 0002's link-in-place flow is ideal — linking keeps the UID, so the entitlement attaches to the same identity that owns the data, and Firebase's own guidance is to convert anonymous users to permanent accounts exactly at moments like purchase ([Anonymous auth best practices](https://firebase.blog/posts/2023/07/best-practices-for-anonymous-authentication/)). This also kills the nastiest merge edge case (a paid guest union-merging into an existing account and stranding the subscription on an abandoned UID).
- **Gate AI in two stages.** Stage 1 (ship with billing): make `AI_DAILY_LIMIT` plan-derived (e.g. free 5/day, premium 100/day fair-use) — still client-enforced and therefore advisory, exactly like today's 40/day, with App Check as the hard backstop. Stage 2 (only if abuse or cost data demands it): move the Gemini call behind a callable Cloud Function that meters server-side. Firebase AI Logic's own per-user limit **cannot** do plan tiers — it's one global per-user RPM knob ("Currently, there isn't a way to set the rate limit for a specific user or specific group of users", [AI Logic quotas](https://firebase.google.com/docs/ai-logic/quotas)) — so real per-plan enforcement means proxying the call.
- **Pricing shape:** the 2026 consensus for AI-costed features is a **small free quota + paid tier with a generous fair-use allowance**, not "unlimited AI" ([Metronome 2026 trends](https://metronome.com/blog/2026-trends-from-cataloging-50-ai-pricing-models)). Comparable trackers charge £40–80/yr (MyFitnessPal $79.99/yr, MacroFactor $71.99/yr, Lose It! $39.99/yr) — Makrofy's "easy-above-all" single-feature premium can healthily undercut at **~£20–35/yr**.

---

## 0. What the codebase gives us (and constrains) today

Facts that shape every option below:

| Fact | Where | Consequence for billing |
|---|---|---|
| Client-only Vite/React PWA; **no server, no Cloud Functions**; Firebase Hosting static | `firebase.json` (no `functions` block), ADR 0001 | Webhooks have nowhere to land today; a `functions/` workspace + Blaze plan is the entry fee for any provider |
| `firestore.rules` = one catch-all: `/users/{uid}/{document=**}` read/write iff `request.auth.uid == uid` | `firestore.rules` | The client can write **anything** under its own UID — including a future subscription doc and today's `aiUsage` counter. Entitlement docs need an explicit server-only carve-out **above** the catch-all |
| Users are bare UIDs — no profile doc, no roles (ADR 0003 killed `user_settings`) | `src/data/identity.ts`, ADR 0002/0003 | Subscription record is a net-new settings-like doc; the ADR 0006 "existing account wins" merge precedent applies to it |
| Guest = anonymous Auth user; Google sign-in **links onto the same UID**; second-device collision = union merge | ADR 0002 | Purchases should require a linked (non-anonymous) account; linking keeps the UID so no entitlement migration is ever needed |
| AI = Gemini 3.1 Flash-Lite via **Firebase AI Logic client SDK** (Vertex backend), App Check (reCAPTCHA Enterprise) enforced | `src/lib/ai.ts` | The AI call never touches our server today; server-side metering requires moving the call, not just wrapping it |
| Existing quota: `AI_DAILY_LIMIT = 40`/day, advisory, checked client-side in `runFill()` before `consumeAiUse()` increments `/users/{uid}/aiUsage/{day}` | `src/data/ai-quota.ts`, `src/screens/main/useAiFill.ts` (~lines 103–111), ADR 0010, spec §AI | **This is the seam.** A plan-aware limit slots in exactly here with ~10 lines changed. Note it is self-writable: a motivated user can reset their own counter — acceptable while advisory, not acceptable as a paid-tier boundary |
| Settings sheet has a `StubRow` pattern for unshipped features | `src/screens/settings/SettingsSheet.tsx` | Natural surface for "Upgrade" / "Manage subscription" rows |
| i18n EN + ES | `src/lib/i18n/` | Paywall, quota-hit hints, and checkout hand-off copy need both locales from day one |

Also relevant: the prior research note ([gemini-firebase-ai-logic-macro-fill.md](gemini-firebase-ai-logic-macro-fill.md)) established that grounding costs real money per call beyond the free allowance (Gemini 3 series: 5,000 grounded prompts/month free, then **$14/1,000**), that budget alerts **don't cap spend**, and that App Check stops non-app clients but not a signed-in user hammering the button. The economic exposure that motivates gating is the grounding fee, not token cost.

---

## 1. What are we selling? The 2026 pricing-model landscape

### 1.1 Patterns that dominate

Current coverage of AI-feature monetization converges on a few points ([Metronome — 2026 trends from 50+ AI pricing models](https://metronome.com/blog/2026-trends-from-cataloging-50-ai-pricing-models), [Flexprice hybrid pricing guide](https://flexprice.io/blog/hybrid-pricing-guide), [Dodo — AI SaaS monetization 2026](https://dodopayments.com/blogs/ai-saas-monetization-2026)):

- **Hybrid is the default** (60%+ of AI products): a flat subscription for access + a consumption dimension (quota/credits) for the AI. For a consumer app the consumption dimension is usually invisible — it shows up as "N AI fills per day" on each tier, not as metered billing.
- **Free tiers survive, but sized to real variable cost.** Free AI has a real marginal cost (for Makrofy: the grounding fee), so the free quota should let a user *genuinely experience* the feature and no more, with a clear upgrade prompt at exhaustion.
- **Avoid "unlimited AI"** on a flat plan unless backed by explicit fair-use throttles. The safe framing for premium is a high daily cap ("100 AI fills a day — more than anyone actually logs") rather than the word "unlimited".
- **Predictability beats precision** for consumers: tiers + included usage, never overage charges. If a user can't predict the bill, they churn at renewal.
- Gates in AI products increasingly center on **consumption capacity** (how much AI), not feature count — which matches Makrofy exactly: same feature, bigger allowance.

### 1.2 What comparable apps charge (2026)

([kcalm comparison](https://kcalm.app/blog/best-calorie-tracking-apps-comparison/), [NutriScan MFP vs MacroFactor](https://nutriscan.app/blog/posts/myfitnesspal-vs-macrofactor-2026-which-paid-tracker-b86a2f0b87), [MacroFactor pricing](https://macrofactor.com/macrofactor/), [Garage Gym Reviews roundup](https://www.garagegymreviews.com/best-calorie-counter-apps))

| App | Monthly | Annual | Model |
|---|---|---|---|
| MyFitnessPal Premium | $19.99 | $79.99 | Freemium; AI Meal Scan is premium |
| MyFitnessPal Premium+ | $24.99 | $99.99 | Adds meal planning |
| MacroFactor | $11.99 | $71.99 (~$6/mo eff.) | **Paid-only**, 7-day trial; AI photo logging included |
| Lose It! Premium | — | $39.99 | Freemium; macros are premium |
| Fitia Premium | $19.99 | $59.99 | Freemium; AI logging premium |
| Cronometer Gold | $4.99 | ~$49.99 | Freemium |

Takeaways for Makrofy:

- The market has trained consumers that **AI food logging is a premium feature** — gating AI fill is normal, not hostile.
- Makrofy is deliberately narrower than all of these ("easy above all", no coaching/recipes/plans), so it should price at the **bottom of the band**: something like **£2.49–2.99/mo, £19.99–29.99/yr** reads as fair and still carries ~10–30× headroom over the marginal grounding cost of a heavy user (~£0.9/yr at 5 grounded fills/day, $14/1k).
- **Annual-first** presentation (like Lose It!) suits a habit app; monthly exists as the low-commitment door.
- A plausible V1 tier split, using only consumption + future-feature gates (no current feature removed — important for goodwill with existing users):
  - **Free:** everything today, AI fill **5/day** (down from 40 — announce gracefully, or grandfather existing users at a higher courtesy cap for a period).
  - **Premium:** AI fill 100/day (fair-use framing), plus first claim on future premium features (Health Connect export in V3, stats depth, etc.).

---

## 2. Payment-provider options

The fundamental fork: with **Stripe direct** you are the merchant of record — cheapest fees, but *you* owe tax registration/filing wherever your consumers are. With a **Merchant of Record** the provider legally resells your product — higher fees, zero tax surface. For a solo UK developer selling a low-priced consumer subscription worldwide, this fork matters more than any API difference.

### 2.1 Tax reality for a UK seller (why MoR is the default answer)

([Stripe — UK VAT on digital products](https://stripe.com/resources/more/uk-vat-on-digital-products), [Stripe — EU VAT & OSS](https://stripe.com/guides/introduction-to-eu-vat-and-european-vat-oss))

- **UK:** UK-established business selling to UK consumers — VAT registration only above **£90,000** taxable turnover. Fine at the start.
- **EU:** for digital services sold B2C into the EU by a non-EU business there is **no threshold — VAT is due from the first sale**, in the consumer's member state, at that state's rate. The (non-Union) OSS scheme collapses this to one quarterly filing, but it's still a registration, quarterly returns, evidence-of-location record-keeping, and rate maintenance — post-Brexit this is *separate from* any UK VAT registration.
- **US:** state-by-state economic nexus thresholds for SaaS; irrelevant at first, a real burden later.
- Subscription VAT must be reassessed against **customer location at each renewal**.

Options like Stripe Tax **calculate and collect** but do **not** register or file for you (Tax Basic: 0.5%/transaction, [stripe.com/gb/pricing](https://stripe.com/gb/pricing)). An MoR removes the obligation entirely because you sell to the MoR, and the MoR sells to the consumer ([Fungies MoR guide](https://fungies.io/merchant-of-record-complete-guide-2/)).

**Verdict:** unless the plan is UK-only sales (unenforceable for a web app), raw Stripe means either ignoring EU VAT (non-compliant) or doing OSS admin forever. For a one-person product, MoR.

### 2.2 Stripe direct (for completeness / the cost floor)

- **Fees (UK account, [stripe.com/gb/pricing](https://stripe.com/gb/pricing)):** UK standard cards **1.5% + 20p** (premium cards 1.9% + 20p), EEA cards 2.5% + 20p, international 3.25% + 20p, +2% if currency conversion; **Billing 0.7%** of recurring volume; **Tax Basic 0.5%**/transaction. All-in on a UK card: ~**2.7% + 20p**.
- **Integration for Makrofy:** hosted **Stripe Checkout** (redirect; no card UI to build) + **Customer Portal** (hosted cancel/upgrade/card-update) + a webhook Cloud Function listening to `customer.subscription.created/updated/deleted`. Stripe's **Entitlements API** ([docs](https://docs.stripe.com/billing/entitlements)) can even hand us feature-level grants (`active_entitlement_summary` events) instead of us mapping price IDs → features by hand — genuinely nice, and the closest raw-Stripe gets to the extension's ergonomics.
- **Client without a server?** Stripe **Payment Links** can sell a subscription with zero code (pass `client_reference_id={uid}` in the URL), so the *checkout* side needs no function — but fulfilment still needs the webhook function. There is no webhook-less Stripe subscription architecture.
- **Verdict:** cheapest fees, best docs, most control — and the full tax burden. The right choice only if MoR fees ever become material (i.e., a good problem to have; migration later is possible since subscriptions can be exported, though painful).

### 2.3 The "Run Payments with Stripe" Firebase extension — pattern yes, dependency no

The extension ([extensions.dev listing](https://extensions.dev/extensions/stripe/firestore-stripe-payments), [README](https://github.com/invertase/stripe-firebase-extensions/blob/next/firestore-stripe-payments/README.md)) is architecturally the perfect fit for this codebase — which is exactly why its design is worth stealing:

- Deploys six Cloud Functions (`createCustomer`, `createCheckoutSession`, `createPortalLink`, `handleWebhookEvents`, `onUserDeleted`, `onCustomerDataDeleted`).
- Client writes a doc → function creates a Stripe Checkout session → client redirects. Webhooks sync products/prices and each user's subscription status **into Firestore**, so the app *reads entitlement as a normal Firestore doc* — precisely the ADR 0001 shape.
- Sets a **`stripeRole` custom claim** on the Firebase Auth user from product metadata, for use in security rules (`request.auth.token.stripeRole == "premium"`).
- Requires Blaze plan.

**But:** Stripe handed the extension to Invertase in 2023, and the GitHub repository now shows **archived on June 18, 2026 — read-only**, with the status note "This repository is not actively maintained. The source code and extensions remain available in their current stable state for existing users, but no further updates, bug fixes, or support will be provided." An unmaintained dependency on the payments path (webhook handlers rot as Stripe API versions advance) is a bad foundation for a new build in July 2026. _(Double-check the Extensions Hub listing before deciding — the repo's layered transfer/archive notices are confusing, but "archived + read-only" is what GitHub reports today.)_

**Verdict:** don't install. Hand-roll the same three functions (~200 lines total with the `stripe` SDK) or — better — apply the same pattern to an MoR's webhooks.

### 2.4 Merchants of Record compared

([fintechspecs comparison](https://fintechspecs.com/blog/stripe-vs-paddle-vs-lemon-squeezy-vs-polar-merchant-of-record-b2b-saas/), [buildmvpfast MoR comparison](https://www.buildmvpfast.com/blog/lemon-squeezy-vs-polar-paddle-merchant-of-record-2026), [stilllater](https://stilllater.com/dev-tools/lemonsqueezy-vs-stripe-vs-paddle/), [Polar review](https://fungies.io/polar-sh-review-2026-2/), [Dodo on Stripe Managed Payments fees](https://dodopayments.com/blogs/stripe-managed-payments-fees-explained), [Lemon Squeezy 2026 update](https://www.lemonsqueezy.com/blog/2026-update))

| | **Paddle** | **Polar** | **Lemon Squeezy** | **Stripe Managed Payments** |
|---|---|---|---|---|
| Fee | 5% + $0.50 | **4% + $0.40** | 5% + $0.50 | 3.5% **on top of** Stripe fees → ~6.4% + 30¢ all-in, worst-case >8–10% intl. |
| Tax coverage | **Most mature** — US states, all EU, UK, AUS, several Asian markets | US + EU solid (rides Stripe Tax), expanding | Mature | Stripe-grade |
| Maturity/risk | Established, at-scale SaaS standard | Younger (10k devs early 2026), open-source, dev-first | **Sunsetting** — being migrated into Stripe Managed Payments after acquisition | Public preview (Feb 2026), ~35 countries |
| Integration | Paddle.js overlay checkout in the SPA + webhooks; **domain approval** process before go-live ([docs](https://developer.paddle.com/build/checkout/build-overlay-checkout)) | Hosted checkout links or embedded; REST API, [Standard Webhooks](https://polar.sh/docs); hosted customer portal | (don't start here) | Stripe APIs |
| Consumer-app fit | Strong | Strong (built for exactly this profile) | — | Overpriced for this |

On a **£29.99/yr** subscription, the per-subscriber annual cost of fees:

| Route | Fees ≈ | Note |
|---|---|---|
| Stripe direct (UK card, +Billing+Tax) | **~£1.00** | plus your OSS/VAT admin time |
| Polar | **~£1.50** | zero tax admin |
| Paddle | **~£1.87** | zero tax admin |
| Stripe Managed Payments | ~£2.40+ | zero tax admin |

The absolute differences are noise at consumer price points; choose on **risk and DX**, not fee.

**Verdict:** **Paddle if you want the boring, proven choice; Polar if you value DX and the lower fee and accept a younger vendor.** Both need the same Makrofy-side build: one webhook Cloud Function + an entitlement doc. Avoid Lemon Squeezy (explicitly in migration) and Stripe Managed Payments (fee stacking) for a new build.

### 2.5 RevenueCat Web Billing

([Web overview](https://www.revenuecat.com/docs/web/overview), [Web SDK](https://www.revenuecat.com/docs/web/web-billing/web-sdk), [Firebase integration](https://www.revenuecat.com/docs/integrations/third-party-integrations/firebase-integration))

RevenueCat is an **entitlement platform**: its data model (Offerings → Products → Entitlements per app-user-ID) is exactly the abstraction we'd otherwise hand-build, and its Web SDK sells subscriptions in a web app keyed to our Firebase UID. Its killer feature is **cross-platform**: buy on web, unlock on iOS/Android automatically — which matters because V3's Health Connect ambition implies native Android someday, where Google Play billing rules and RevenueCat's store SDKs become relevant.

Caveats: RevenueCat is **not** an MoR — Web Billing runs on your own Stripe account underneath, so the tax problem comes back (plus RevenueCat's ~1% platform fee at scale on top of Stripe's). And the **Firebase extension/integration does not currently emit events for Web Billing transactions** ([community thread](https://community.revenuecat.com/third-party-integrations-53/firebase-integration-not-working-with-revenuecat-web-billing-7436)) — we'd consume RevenueCat's own webhooks with our own function anyway.

**Verdict:** the right answer **later, if and only if** Makrofy ships native store apps. For a web-only PWA it adds a vendor without removing the tax burden. Park it; the entitlement-doc architecture below is RevenueCat-compatible if we ever migrate (their webhook would write the same doc).

---

## 3. Entitlement architecture on this stack

### 3.1 Where entitlement state lives

Two mechanisms exist on Firebase, and the mature pattern (used by the Stripe extension, RevenueCat's integration, and every hand-rolled tutorial, e.g. [aronschueler.de walkthrough](https://aronschueler.de/blog/2025/03/17/implementing-stripe-subscriptions-with-firebase-cloud-functions-and-firestore/)) is **both, with Firestore as the source of truth**:

1. **Firestore doc** — proposal: `/users/{uid}/settings/subscription`:

   ```jsonc
   {
     "plan": "premium",            // "free" implied by absence of the doc
     "status": "active",           // active | past_due | canceled | expired
     "provider": "paddle",         // paddle | polar | stripe (future-proofing)
     "providerCustomerId": "ctm_…",
     "currentPeriodEnd": <Timestamp>,  // drives offline grace, see 3.4
     "updatedAt": <Timestamp>
   }
   ```

   Written **only** by the webhook Cloud Function (Admin SDK bypasses rules). The client reads it through a `useEntitlement()` hook exactly like `useGoal()` — realtime, offline-cached, zero new infra concepts (ADR 0001 preserved).

2. **Custom claim** (optional, phase 2): the same function mirrors `plan` into `setCustomUserClaims(uid, { plan: "premium" })`. Claims are readable inside security rules (`request.auth.token.plan`) with **zero reads**, which matters if any *rules* ever need to gate by plan (e.g. a premium-only collection). Caveat: claims ride the ID token, which refreshes **on the client's schedule (~1 h)** — after checkout the app must call `getIdToken(true)` (the existing `refreshIdentity()` in `identity.ts` is the natural home). The Firestore doc has no such lag, which is why it, not the claim, should drive UI.

### 3.2 Security-rules change (required, small)

Today's single catch-all lets a user write their own subscription doc. Carve out server-only docs **before** the recursive match:

```
match /users/{userId}/settings/subscription {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow write: if false;  // Admin SDK only
}
match /users/{userId}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

(Firestore applies the most specific matching rule; verify overlap behaviour in the emulator — the existing `@firebase/rules-unit-testing` setup in `tests/` covers this nicely.) The same treatment applies to `aiUsage/{day}` **if and when** metering becomes server-authoritative (§4); while advisory, client-writable is fine and keeps offline increments working.

### 3.3 Guests, sign-in, and the union merge (ADR 0002/0006 interplay)

- **Purchase requires a permanent account.** The upgrade flow for an anonymous user is: paywall → "Sign in with Google to subscribe" → `linkWithRedirect` (UID unchanged) → checkout. This follows Firebase's explicit guidance to convert anonymous users at high-commitment moments ([best practices](https://firebase.blog/posts/2023/07/best-practices-for-anonymous-authentication/)), and because linking preserves the UID, the entitlement doc lands on the identity that already owns the user's Entries — no migration, ever.
- **Why guests must not buy:** if an anonymous UID could hold a subscription and the user later signed into a *different* existing account, the union merge (ADR 0002) signs them into the existing account and abandons the guest UID — stranding a paid subscription on an unreachable identity. Requiring sign-in first eliminates the whole class.
- **Merge semantics for the subscription doc:** ADR 0006's settings-like rule ("existing account wins") is correct here and needs no new machinery — but note the doc is server-written, so the client-side merge code must simply *skip* it (it can't copy it anyway under the new rules). Edge case to document: user owns premium on account A, signs into account B on a second device → B's plan applies. That matches how every multi-account product behaves; provider-side, the subscription still belongs to A's email via the customer portal.
- **Checkout identity plumbing:** pass the Firebase UID through checkout (Paddle: `customData`; Polar: `metadata` / external customer ID; Stripe: `client_reference_id`) so the webhook can address `/users/{uid}/…` without email-matching heuristics. Email matching is a trap (Google account email ≠ payment email surprisingly often).

### 3.4 Offline behaviour (this app is offline-first)

The entitlement doc is served from the persistent cache offline — good. Policy decisions:

- **Grace, not lockout:** treat `status == "active" && currentPeriodEnd + 3–7 days > now` as premium even if the doc is stale, so a fortnight in the mountains doesn't dark-pattern a paying user. The webhook refreshes `currentPeriodEnd` on every renewal event.
- The **AI feature requires network anyway** (Gemini call), so AI gating never needs an offline story beyond the cached counter that already exists.
- Rules are *not* evaluated offline, but the subscription doc is read-only for the client, so cache consistency is one-directional — no conflict cases.

### 3.5 The server component (new, minimal)

- A `functions/` workspace (Node 2nd gen; the repo is already pnpm-workspace-ready — `pnpm-workspace.yaml` currently lists `packages: []`).
- **Blaze plan required** (functions don't run on Spark). Free tier: 2M invocations/month; webhook + checkout traffic for a small app rounds to £0. This does *not* disturb the earlier Spark-tier analysis in [firebase-backend-validation.md](firebase-backend-validation.md) — Blaze keeps the same free quotas, it just adds a card behind them; pair with a budget alert.
- Functions needed, MoR route: **1** (webhook receiver: verify signature → map event → write subscription doc → set claim). Checkout can be a hosted link with the UID in metadata; the customer portal is provider-hosted. Stripe-direct route: 2–3 (webhook + createCheckoutSession + portal link), i.e. hand-rolling the extension.
- CI: extend the existing GitHub Actions deploy to run `firebase deploy --only functions` (a new secret with functions deploy permission).

---

## 4. Enforcing the AI gate — an honest escalation ladder

The current protection stack (spec §AI, ADR 0010): App Check (reCAPTCHA Enterprise, enforced) keeps non-app clients out entirely; the 40/day counter is client-side and self-writable, i.e. **advisory**; a budget alert watches spend but "alerts don't cap spend". Gating by plan changes the *limit*, not (necessarily) the enforcement level. The ladder:

**Level 0 — today.** Flat 40/day advisory. Cost exposure per legit-but-hostile identity: bounded only by AI Logic's per-user gateway limit, default **100 RPM** ([quotas doc](https://firebase.google.com/docs/ai-logic/quotas)) — worth turning down to something like 5–10 RPM in the Google Cloud console *regardless of everything else in this note*; it's a free win and 100 RPM is absurdly high for one human tapping ✨.

**Level 1 — plan-derived advisory limit (ship with billing).** `AI_DAILY_LIMIT` becomes `aiDailyLimit(plan)` (5 free / 100 premium), read from the entitlement hook; the check stays in `runFill()`. One small diff, no latency change, no architecture change. Weakness: unchanged from today — a user who edits their own `aiUsage` doc via the SDK gets free-tier-unlimited. Realistic risk for a consumer calorie app: low; App Check still blocks scripted abuse, and the per-user RPM caps burn rate. **Important limitation to record: Firebase AI Logic's per-user rate limit cannot vary by user or tier** — "It's the rate limit applied to *all* your users. Currently, there isn't a way to set the rate limit for a specific user or specific group of users" — and it's per-*minute*, not per-day, so it can never express "5/day for free users". Level 1's per-plan quota is therefore honest-user UX, not security.

**Level 2 — server-authoritative metering (move the call).** The only way to make plan limits *real* is to move the Gemini call server-side, because AI Logic's client SDK offers no per-request server hook:

- A **callable Cloud Function** (v2 `onCall`, or `onCallGenkit` for built-in streaming — [Firebase blog](https://firebase.blog/posts/2025/03/streaming-cloud-functions-genkit/)) with `enforceAppCheck: true`, calling Vertex AI via the service account (no API key to leak; or Secret Manager if using the Developer API).
- Inside: read plan → transactional increment on `aiUsage/{day}` (now rules-locked to `write: if false` for clients) → reject over-quota with a typed error the existing `phase: hint` UI maps onto → run the same grounded + `responseSchema` prompt from `macro-fill.ts` server-side.
- Per-user limiting is either the Firestore transaction counter (simplest, matches existing shape) or [firebase-functions-rate-limiter](https://github.com/Jblew/firebase-functions-rate-limiter) for sliding windows.
- **Costs of Level 2:** latency (+cold start; mitigable with `minInstances` ≈ pennies/day), a second copy of the prompt/schema logic to keep in sync (mitigable: move `macro-fill.ts` prompt-building into a shared package in the pnpm workspace), and the loss of Firebase AI Logic's client-side niceties. The Firebase-blessed pattern for exactly this ("user auth + per-user rate limit on AI endpoints") is documented in [Securing AI endpoints from abuse](https://firebase.blog/posts/2025/11/securing-ai-endpoints-from-abuse/).

**Level 3 — replay protection.** App Check **limited-use tokens** + `consumeAppCheckToken` (callable) or AI Logic's replay protection (the one standard Google service that supports it — [enforcement doc](https://firebase.google.com/docs/app-check/enable-enforcement)) make each attestation single-use at the price of an extra verification round-trip per call. Only justified if Level 2's logs show token-replay abuse. Start sending limited-use tokens early anyway (config flag) so enforcement can be flipped later without a client-version long tail.

**Recommendation:** ship Level 1 with billing (plus the free RPM-knob tightening from Level 0); build Level 2 only when the Firebase console's grounding-call counts diverge from plausible human usage or a real bypass is observed. The entitlement doc design is identical either way, so nothing is thrown away on escalation.

---

## 5. Gating future features

- **One `useEntitlement()` hook** returning `{ plan, isPremium, aiDailyLimit, … }` becomes the single client-side gate for everything later — stats depth, Health Connect export (V3), premium themes. Feature checks read *derived capabilities* (`can.exportHealthConnect`), not `plan == "premium"`, so a future second tier or lifetime plan doesn't touch call sites.
- **Feature flags stay in code, not Remote Config.** The plan→capability mapping is a pure function versioned with the app; introducing Remote Config for it would add a second source of truth for no V1 benefit.
- **UI surfaces:** SettingsSheet gets an Upgrade/Manage row (the `StubRow` pattern graduates); the quota-hit hint in `useAiFill` (`t.addCard.aiLimit`) becomes the paywall's front door — quota exhaustion is *the* conversion moment in every comparable app.
- **Server-gated features** (if any ever handle data the client must not see) get the custom-claim treatment in rules; everything cosmetic stays client-gated. Client-side gating of *UI* is fine forever — the thing being protected (Gemini spend) is the only asset with real bypass cost, and it's handled in §4.

---

## 6. Recommended architecture (phased)

**Phase 0 — prep (no payments):** tighten AI Logic per-user RPM; add `useEntitlement()` reading a not-yet-written subscription doc (absent = free); make `AI_DAILY_LIMIT` plan-derived; add the rules carve-out + rules tests; write the paywall/upgrade UI against a hand-planted Firestore doc in the emulator. Everything here is shippable and testable **before choosing a provider**.

**Phase 1 — billing (MoR + one function):** pick Paddle or Polar (grill: risk appetite vs. DX; both fit); Blaze plan; `functions/` workspace with the webhook receiver (signature check → subscription doc → custom claim); hosted checkout links carrying the UID; provider-hosted customer portal linked from Settings; require Google link before checkout; EN+ES paywall copy; budget alert sanity-check.

**Phase 2 — only if evidence demands:** move the Gemini call behind `onCall`/`onCallGenkit` with server-side metering (rules-lock `aiUsage`), then limited-use App Check tokens.

**Decisions this note deliberately leaves open (need product answers, likely a `/grill-me` session):**
1. Free-tier AI allowance (5/day?) and whether existing users get grandfathered.
2. Price points and monthly vs annual-first.
3. Paddle vs Polar (vendor-risk appetite).
4. What (if anything) besides AI is premium at launch — launching with *only* an AI cap is simplest and matches the codebase.
5. Refund/cancellation UX expectations (MoR portals handle mechanics; copy is ours).
6. Whether V3 native-app ambitions are firm enough to weight RevenueCat's cross-platform entitlements today (this note says no — revisit at V3).

---

## Sources

**Primary docs:** [Firebase AI Logic — quotas & per-user rate limit](https://firebase.google.com/docs/ai-logic/quotas) · [Firebase App Check — enforcement & limited-use tokens](https://firebase.google.com/docs/app-check/enable-enforcement) · [App Check for Cloud Functions](https://firebase.google.com/docs/app-check/cloud-functions) · [Cloud Functions — callable](https://firebase.google.com/docs/functions/callable) · [onCallGenkit](https://firebase.google.com/docs/functions/oncallgenkit) · [Firebase blog — streaming AI with Cloud Functions + Genkit](https://firebase.blog/posts/2025/03/streaming-cloud-functions-genkit/) · [Firebase blog — securing AI endpoints from abuse](https://firebase.blog/posts/2025/11/securing-ai-endpoints-from-abuse/) · [Firebase blog — anonymous auth best practices](https://firebase.blog/posts/2023/07/best-practices-for-anonymous-authentication/) · [Stripe Checkout/Billing/Tax UK pricing](https://stripe.com/gb/pricing) · [Stripe Entitlements](https://docs.stripe.com/billing/entitlements) · [Stripe — EU VAT & OSS guide](https://stripe.com/guides/introduction-to-eu-vat-and-european-vat-oss) · [Stripe — UK VAT on digital products](https://stripe.com/resources/more/uk-vat-on-digital-products) · [Stripe Managed Payments docs](https://docs.stripe.com/payments/managed-payments) · [Stripe support — Managed Payments pricing](https://support.stripe.com/questions/managed-payments-pricing) · [stripe-firebase-extensions repo (archived)](https://github.com/invertase/stripe-firebase-extensions) · [firestore-stripe-payments README](https://github.com/invertase/stripe-firebase-extensions/blob/next/firestore-stripe-payments/README.md) · [Paddle — overlay checkout](https://developer.paddle.com/build/checkout/build-overlay-checkout) · [Paddle.js overview](https://developer.paddle.com/paddlejs/overview) · [Polar](https://polar.sh/) · [RevenueCat — web overview](https://www.revenuecat.com/docs/web/overview) · [RevenueCat — Web SDK](https://www.revenuecat.com/docs/web/web-billing/web-sdk) · [RevenueCat — Firebase integration](https://www.revenuecat.com/docs/integrations/third-party-integrations/firebase-integration) · [Lemon Squeezy — 2026 update / Stripe Managed Payments](https://www.lemonsqueezy.com/blog/2026-update)

**Comparisons & analysis (secondary, dated 2026):** [Metronome — trends from 50+ AI pricing models](https://metronome.com/blog/2026-trends-from-cataloging-50-ai-pricing-models) · [Flexprice — hybrid pricing guide](https://flexprice.io/blog/hybrid-pricing-guide) · [Dodo — AI SaaS monetization 2026](https://dodopayments.com/blogs/ai-saas-monetization-2026) · [Dodo — Stripe Managed Payments fees explained](https://dodopayments.com/blogs/stripe-managed-payments-fees-explained) · [fintechspecs — MoR decision 2026](https://fintechspecs.com/blog/stripe-vs-paddle-vs-lemon-squeezy-vs-polar-merchant-of-record-b2b-saas/) · [buildmvpfast — MoR comparison](https://www.buildmvpfast.com/blog/lemon-squeezy-vs-polar-paddle-merchant-of-record-2026) · [stilllater — indie MoR decision](https://stilllater.com/dev-tools/lemonsqueezy-vs-stripe-vs-paddle/) · [Fungies — Polar review 2026](https://fungies.io/polar-sh-review-2026-2/) · [Fungies — MoR tax guide](https://fungies.io/merchant-of-record-complete-guide-2/) · [aronschueler.de — Stripe subs with Cloud Functions](https://aronschueler.de/blog/2025/03/17/implementing-stripe-subscriptions-with-firebase-cloud-functions-and-firestore/) · [firebase-functions-rate-limiter](https://github.com/Jblew/firebase-functions-rate-limiter) · [RevenueCat community — Web Billing/Firebase gap](https://community.revenuecat.com/third-party-integrations-53/firebase-integration-not-working-with-revenuecat-web-billing-7436) · Competitor pricing: [kcalm](https://kcalm.app/blog/best-calorie-tracking-apps-comparison/) · [NutriScan](https://nutriscan.app/blog/posts/myfitnesspal-vs-macrofactor-2026-which-paid-tracker-b86a2f0b87) · [MacroFactor](https://macrofactor.com/macrofactor/) · [Garage Gym Reviews](https://www.garagegymreviews.com/best-calorie-counter-apps)

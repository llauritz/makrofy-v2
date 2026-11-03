---
status: accepted
---

# The AI allowance is a 30-day plan cycle, checked on the client

> **Update (3 November 2026):** the allowance is now enforced on the server
> by the `aiFill` function (ADR 0016, the Level 2 below), with the same
> limits (Free 10 · Pro 1,000 · Unlimited 10,000). The cycle rules here still hold.

Records [#64](https://github.com/llauritz/makrofy-v2/issues/64) (resolved
2026-07-31), now built.

**Level 1 is honest-user UX, not security.** The limit is checked on the phone
in `runFill()` and the counter stays client-writable, because the client is
what increments it. A technical user can grant themselves more fills. App
Check (reCAPTCHA Enterprise) and Firebase AI Logic's per-user rate limit (to be
lowered from 100 to 20 RPM in the Google Cloud console) are the only enforced controls; the monthly cost check below is the
real backstop.

> **The cycle doc** `/users/{uid}/aiCycles/{cycle start, ISO}`:
> `{ fills, calls, grounded, updatedAt }`. `fills` and `calls` count as a
> round trip starts, so the counter moves with the tap; `grounded` once its
> reply is in.

## Decisions

- **Unit:** one ✨ interaction is one fill. The answer to a clarifying
  question counts as a call, not a fill, and is never refused at the limit.
  `grounded ÷ fills` is the queries-per-fill figure #60's pre-launch price
  check needs.
- **Period:** fixed 30-day cycles counted from an anchor —
  `planStartedAt` from the entitlement doc (ADR 0012), or the Auth account's
  creation time for someone who never bought. Each re-anchor (purchase,
  upgrade, lapse, resubscribe) starts a fresh cycle with the full allowance.
  Neither anchor can be moved from the client. Cycles drift ~5 days a year
  against an annual renewal; accepted.
- **Limits:** Free 10 · Pro 1,000 · Unlimited 10,000 per cycle
  (`src/data/plans.ts`). No per-day sub-brake.
- **Reading:** one `onSnapshot` on the current cycle doc next to the
  entitlement listener (`src/screens/paywall/useSubscription.ts`), so the gate
  answers instantly and offline. A timer rolls the cycle over at its end.
- **Exhaustion** is a typed refusal per plan, with the way up for Free and Pro.
- **Before go-live** the old daily brake (`AI_DAILY_LIMIT`, `aiUsage/{day}`)
  still gates and the cycle doc only counts, so the telemetry exists before
  the price check. Billing switched on (`src/screens/paywall/switch.ts`) swaps
  the gate. The `aiUsage` docs go dead after launch — left in place, unread.
- **Guests keep their 10** (a cleared install farms ≈ $0.14; App Check is the
  brake). Unknown or missing entitlement → Free limits.

## Escalation to Level 2 (server-side metering)

A standing monthly owner task: compare AI grounding cost with subscription
revenue on the Google and Paddle dashboards. Build server-authoritative
metering when AI cost exceeds **25% of revenue** in a month, or **$50** in any
month before there is revenue.

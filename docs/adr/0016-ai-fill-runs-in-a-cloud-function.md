---
status: accepted
---

# AI fill runs in a Cloud Function that enforces the allowance

Supersedes the "checked on the client" part of ADR 0013 and the phone-side
Gemini call of ADR 0010. Price review, 3 November 2026.

The phone used to call Gemini itself through Firebase AI Logic and count its
own fills in a doc it could write. The plan limits were advisory, and the only
enforced brake was AI Logic's per-user rate limit: a script at 20 requests a
minute could run up about $18,000 of search fees in a month. One fill costs
about $0.02, nine tenths of it Google's search fee ($14 per 1,000 queries,
billed per query), so the margin on Pro sat close to zero.

## Decisions

- **One callable, `aiFill`** (`functions/src/ai-fill.ts`), takes
  `{ prompt, final }` and returns the model's JSON text, the Search
  attribution and the finish reason. The phone validates the reply exactly as
  before (`src/lib/macro-fill.ts`).
- **Admission in one transaction.** The function reads the entitlement doc,
  anchors the cycle on `planStartedAt` (or the account's creation for someone
  who never bought), and counts the round trip in
  `/users/{uid}/aiCycles/{cycle start}` only if the plan allows it. Two phones
  can't both take the last fill. The rules now refuse client writes to
  `aiCycles`; the phone only listens.
- **Two brakes** a person never meets: at most 10 round trips a minute, and
  clarifying answers can't outnumber fills (plus 3 for retries).
- **Refusals** are `resource-exhausted` with the reason, plan, limit and reset
  date. The phone still refuses an exhausted cycle itself first, from its live
  copy, so the line shows instantly and offline.
- **App Check is checked in the handler**, not with `enforceAppCheck`, so a
  `{ warm: true }` call can start an instance without a token. The app sends it
  when a fill surface is on screen (at most every 5 minutes), so the first fill
  of a session rarely waits on a cold start, and nothing runs all month.
- **Two-step search.** A first Gemini call without web access answers staples,
  generic dishes and clarifying questions. Only a food whose label or menu is
  the source of truth (a brand, a packaged product, a chain-restaurant item)
  goes on to a second call with Google Search, told to run one query, two at
  most. The model sometimes ignores that (11 queries and 33 s on one latte in
  the 3 Nov bench), so the search step has its own 10 s limit; past it the
  fill estimates without search and comes back "unsure".
  `SEARCH_MODE = "single"` restores the old one-call behaviour. Staples
  get faster (about 1.8 s against 3 s); branded foods pay one short extra call.
- **Cost is counted where it happens.** Each answered trip adds `grounded` and
  `queries` (billed search queries, not just "it searched") to the cycle doc,
  and `fills`, `calls`, `geminiCalls`, `grounded`, `queries` to
  `/aiStats/{UTC day}` for the whole app. `queries ÷ fills` is the number the
  price review needs.
- **Gemini failures are reported by the function** (ADR 0014) with Google's
  HTTP status; the phone reports only what it saw itself (no connection, App
  Check, a reply it couldn't read) and skips errors marked `reported`.
- **Limits:** Free 10 · Pro 200 · Unlimited 1,000 per 30 days
  (`functions/src/ai-allowance.ts`, re-exported by `src/data/plans.ts`).

## Consequences

- The Firebase AI Logic API can be switched off once old app versions have
  updated, which closes the direct route to Gemini. The dev bench
  (`/ai-bench.html`) still uses it and stops working then.
- A fill now goes phone → us-central1 → Gemini. The extra hop is small next
  to the model's 2–3 s.

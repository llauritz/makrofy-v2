# AI fill errors: what's recorded, alerts, and goodwill months

How failed AI fills are caught and sorted (ADR 0014), the one-time setup in
Google Cloud, and how to give an affected paying customer a free month.

## How it works

1. A fill fails on the phone: Google answered with an error, the request hung,
   or the reply broke our four-tier contract. The app sends the error's facts
   (never the food text) to the `reportAiFailure` function.
2. The function decides whose problem it is (`functions/src/ai-failure.ts`)
   and stores the report in `/aiFailures`. Each report is also in the
   function's log: error level when it's ours, warning otherwise.
3. Every 15 minutes `aiFillHealth` sums up the window that just ended. If the
   failures add up to something, it names the side to act, checks Google's
   status pages, lists paying users who were hit, writes `/aiHealth/{window}`
   and logs **`AI fill alert`**, which the alert policy below turns into an
   email.

## Reading a report

| Blame | Kind | What it means | What to do |
|---|---|---|---|
| ours | `bad-request` | Google rejected our request (400) | Check the request shape in `src/lib/ai.ts`; often a schema change on Google's side |
| ours | `model-missing` | The model ID no longer exists (404) | Move `MODEL_ID` to the current model |
| ours | `permission` | 403: API switched off, billing, App Check enforcement | Firebase console → AI Logic; Cloud billing |
| ours | `config` | The SDK refused before sending | Firebase config, AI Logic enabled |
| ours | `quota` | A quota we set or can raise (AI Logic per-user rate limit) | Raise it in the Google Cloud console |
| ours | `bad-output` | The model answered, but not in our contract shape | Prompt / schema / parser (`src/lib/macro-fill.ts`); a sudden wave with no deploy of ours points at a model change by Google |
| ours | `chunk-load` | An open tab asked for a code file the last deploy replaced | Usually passes; many reports mean the service worker isn't updating |
| ours | `app-crash` | Our own code threw | Read the message |
| google | `unavailable`, `server-error`, `timeout`, `overloaded`, `bad-response` | Google is failing or overloaded | Wait; check the incident link in the alert |
| google | `blocked` | Google's filters withheld the reply (`finishReason`) | Nothing, unless it repeats for normal foods |
| device | `network` | The phone lost its connection | Nothing |
| device | `app-check` | App Check refused this phone (often an ad blocker stopping reCAPTCHA) | Nothing, unless many phones at once (the health check alerts on 5) |
| unknown | the SDK's code | Not in the table yet | Read the message, add a rule to `classifyAiFailure` |

Where to look:

- **Firestore console:** `/aiHealth` (one doc per bad quarter hour, newest
  last) and `/aiFailures` (filter on `blame` or `uid`).
- **Logs Explorer:** `jsonPayload.message="AI fill alert"` for the verdicts,
  `jsonPayload.message="AI fill failed"` for single reports.

## One-time setup

Run from the repo folder, signed in to Firebase / gcloud as the owner.

1. **Deploy the functions.** The first scheduled function switches on Cloud
   Scheduler; the CLI asks for that.

   ```sh
   npx firebase deploy --only functions
   ```

2. **Expire old reports** (Firestore TTL; the privacy policy promises 90
   days):

   ```sh
   gcloud firestore fields ttls update expireAt --collection-group=aiFailures --enable-ttl --project=goyaffle
   gcloud firestore fields ttls update expireAt --collection-group=aiHealth --enable-ttl --project=goyaffle
   ```

3. **Email on alerts.** In the Google Cloud console for `goyaffle`:
   Monitoring → Alerting → *Edit notification channels* → Email → add your
   address. Then Logging → Logs Explorer, run this query, and choose
   *Actions → Create log alert*:

   ```
   severity>=ERROR
   jsonPayload.message="AI fill alert"
   ```

   Set *Time between notifications* to 1 hour and *Incident autoclose* to
   1 day, pick the email channel, save. The email links to the log entry,
   whose `verdict`, `alerts` and `googleIncidents` fields say what happened.

## Goodwill month

Paddle can give a paying customer time for free, but nothing in our code does
it on its own: the owner decides who gets one.

**Who was hit:** every `/aiHealth` doc with a `verdict` of `ours` or `google`
lists `payingUids`. The uid's `/users/{uid}/settings/subscription` doc has the
Paddle `subscriptionId`.

**How (recommended): move the next billing date one month later** without
charging for the extra time. It works the same for monthly and yearly plans,
creates no invoice, and the webhook picks up the new period end from the
`subscription.updated` event:

```
PATCH https://api.paddle.com/subscriptions/{subscriptionId}
{ "next_billed_at": "<current next_billed_at + 1 month>",
  "proration_billing_mode": "do_not_bill" }
```

(Sandbox: `https://sandbox-api.paddle.com`.) Paddle refuses this while the
subscription is `past_due` or within 30 minutes of its renewal. The AI
allowance keeps its own 30-day cycles (ADR 0013), so the customer keeps
getting fills through the free month.

Other ways, and why not:

- **A 100% discount for one billing period** (create a discount, then
  `PATCH /subscriptions/{id}` with `discount: { id, effective_from:
  "next_billing_period" }`). Fine for monthly, but on a yearly plan one period
  is a whole year.
- **A refund of one month** (`POST /adjustments`). Moves money back, which
  costs fees, and the customer has to notice it.

A one-tap "give a free month" button for the owner is not built yet.

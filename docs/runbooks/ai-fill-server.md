# AI fill on the server: rollout and the console steps

The AI fill runs in the `aiFill` Cloud Function (ADR 0016). This page is the
order to roll it out in, the settings only the owner can change in the Google
Cloud console, and where to read what fills cost.

## Rollout order

Firebase Hosting deploys the app automatically when a PR merges, and the new
app calls `aiFill`. So the function must be live **before** the merge.

1. **Deploy only the new function**, from this PR's branch. Deploying only
   `aiFill` leaves the Paddle functions exactly as they are.

   ```sh
   git checkout claude/project-thread-og8ogu && git pull
   npx firebase deploy --only functions:aiFill --project goyaffle
   ```

2. **Try it on the PR preview** (the preview talks to the live functions):
   a staple ("1 banana") should answer in about 2 s with no Google chip; a
   brand ("Big Mac") takes a moment longer and shows the chip. The counter
   moves on tap. In Logs Explorer, `jsonPayload.message="AI fill"` shows
   `steps` and `queries` per fill.
   If the first fill fails with `permission` in `/aiFailures`, the function's
   service account can't reach Vertex AI; grant it the role and retry:

   ```sh
   gcloud projects add-iam-policy-binding goyaffle \
     --member="serviceAccount:$(gcloud projects describe goyaffle --format='value(projectNumber)')-compute@developer.gserviceaccount.com" \
     --role="roles/aiplatform.user"
   ```

3. **Merge the PR.** Hosting ships the new app.
4. **Deploy the rules and the rest of the functions** from `main` (the failure
   classifier changed too). Check first that no other thread is mid-deploy.

   ```sh
   git checkout main && git pull
   npx firebase deploy --only firestore:rules,functions --project goyaffle
   ```

5. **A day later, switch off direct access to Gemini.** Phones that haven't
   reloaded since the merge still run the old app, which calls Gemini through
   Firebase AI Logic; give them a day to update. Then:

   ```sh
   gcloud services disable firebasevertexai.googleapis.com --project goyaffle
   ```

   This closes the route around the allowance. The dev bench
   (`/ai-bench.html`) uses that API and stops working; re-enable it for a
   bench run if needed. Leave the **Vertex AI API** (`aiplatform.googleapis.com`)
   on: the function uses it.

## Budget alert

A budget doesn't stop spending, but it emails before a surprise. Cloud console
→ Billing → Budgets & alerts → Create budget: scope the `goyaffle` project,
amount **$50 a month**, alerts at 50%, 90% and 100% of actual spend, email to
the billing admins. Or:

```sh
gcloud billing budgets create \
  --billing-account="$(gcloud billing projects describe goyaffle --format='value(billingAccountName)' | sed 's#billingAccounts/##')" \
  --display-name="Yaffle monthly" --budget-amount=50USD \
  --filter-projects=projects/goyaffle \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
```

## Reading what fills cost

- **`/aiStats/{YYYY-MM-DD}`** (UTC days): `fills`, `calls` (fills plus
  clarifying answers), `geminiCalls` (2 when a fill went on to search),
  `grounded`, `queries` (billed search queries) and `searchTimeouts` (searches
  cut off at 10 s, whose queries are missing from `queries`). Search costs $14 per 1,000
  queries after the first 5,000 each month, so a day's search bill is roughly
  `queries × $0.014` once the free queries are used up.
- **Queries per fill** = `queries ÷ fills`. The price review assumed 1.33
  before the two-step search and aims for 0.4 or less.
- **Per user:** `/users/{uid}/aiCycles/{cycle}` has the same `queries` and
  `grounded` fields next to the allowance count.

## Knobs

| What | Where | Now |
| --- | --- | --- |
| Plan limits | `functions/src/ai-allowance.ts` `CYCLE_LIMIT` | Free 10, Pro 200, Unlimited 1,000 per 30 days |
| Burst brake | `BURST_CALLS`, `BURST_WINDOW_MS` | 10 round trips a minute |
| Search mode | `functions/src/ai-fill.ts` `SEARCH_MODE` | `"two-step"`; `"single"` lets the model decide in one call |
| Search time limit | `SEARCH_TIMEOUT_MS` | 10 s; past it the fill estimates without search (`searchTimeouts` in `/aiStats`) |
| Model | `MODEL_ID` | `gemini-3.5-flash-lite`, thinking LOW |
| Prompts | `functions/src/ai-prompt.ts` | routing, search, single |

A change to any of these needs `npx firebase deploy --only functions:aiFill`.
A limit change also needs the app (it shows the limits), so merge it as well.

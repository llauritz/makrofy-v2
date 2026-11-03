# Router bench for AI fills

Tests whether a cheap decision step can skip Google Search on most fills without making the numbers worse. Search is about 90% of what a fill costs ($14 per 1,000 queries against roughly $0.0015 of tokens), so the question is which foods get searched, not which model answers.

It runs from Node against the real APIs. This is unlike the browser bench at `/ai-bench.html`, which needs App Check.

## What it compares

For each food and round, it makes these calls once:

| Call | What it is |
| --- | --- |
| `search` | the production request: Gemini, Google Search, the four-tier schema |
| `plain` | the same prompt, no search tool |
| `cascade` | a call without search that answers, or replies `{"status":"search"}` (the price review design) |
| `groute` | Gemini as a three-way router: staple, branded or vague |
| `jroute` | Jev (TypeSafe): the same three-way choice, plus a yes/no "needs a search" |
| `jcheck` | Jev: is the answer without search plausible enough to keep? |

`report.mjs` then builds every design from those calls: today's fill, never search, the Gemini cascade, the Gemini router, the Jev router (choice or yes/no), Jev in front of the cascade, and no search first with a Jev check. All designs are scored on the same Gemini answers, so the differences come from the routing alone.

Scores:

- cost per 1,000 fills
- searches per fill
- latency (median and p90, the calls in a design added up)
- kcal within tolerance of the reference
- median kcal error
- right kind of reply (a number for food, a question for vague input)
- the Atwater gap (protein, fat and carbs against kcal)
- imperial units in `servingText`
- routing mix-ups

The food set is in `foods.mjs`: staples (with USDA references), brands (with label references) and vague inputs, in English, Spanish and German.

## Running it

Needs Node 22.18 or later, from the repo root.

```sh
gcloud auth login                     # an account with Vertex AI on goyaffle
echo 'TYPESAFE_API_KEY=...' >> .env.local   # optional; the Jev arms are skipped without it
node scripts/ai-bench/run.mjs --rounds 3
```

Options:

- `--only "Big Mac,sandwich"` picks foods
- `--model`, `--thinking` and `--jev jev-1.14.0` swap models
- `--mock` tests the plumbing with fake replies

With `GEMINI_API_KEY` set, it uses the Gemini Developer API instead of Vertex.

Raw calls go to `docs/research/ai-bench/runs/`. To add the Jev arms to a saved run without new Gemini calls, use `node scripts/ai-bench/run.mjs --add-jev <file>`. To re-score a saved run, use `node scripts/ai-bench/report.mjs <file>`.

A full run is 36 foods × 3 rounds, about 430 Gemini calls (108 with search) and 200 Jev calls. It costs about $2.50 on goyaffle, mostly search fees, and takes around 10 minutes.

The cascade arm imports `ROUTING_PROMPT` from `functions/src/ai-prompt.ts` when that file exists, and otherwise uses a stand-in. The report names which one it used.

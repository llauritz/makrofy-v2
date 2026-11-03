# AI fill bench

Compares models and pipelines for the AI fill on the same labelled foods, with the same scores and the same report layout every time. Nothing here touches the app: it calls the APIs from Node and writes results to `docs/research/ai-bench/`.

This is a prototype bench. A pipeline that wins here is a candidate for a change to the app, not the change itself.

## Words

- **Variant**: one way to turn a food description into a fill. One name on the command line, with options, such as `cascade:model=gemini-3.1-flash-lite`.
- **Step**: one call that variants are built from: a Gemini fill, a router call, a Jev question, or a food table lookup.
- **Run**: some variants × the food set × some rounds, with a stated purpose. Each run gives one raw file and one report.

## Running

Needs Node 22.18 or later and the repo root as the working directory.

```sh
gcloud auth login                          # an account with Vertex AI on goyaffle
# TYPESAFE_API_KEY=... in .env.local        # only for Jev variants
node scripts/ai-bench/bench.mjs list       # the variants and what they do

node scripts/ai-bench/bench.mjs run \
  --name cheap-staples \
  --purpose "Can the food table answer staples as well as Gemini, for less?" \
  --variants "today cascade table-jev jev-table" \
  --rounds 3
```

Options:

| Option | What it does |
| --- | --- |
| `--name` | slug for the files (required) |
| `--purpose` | one sentence: the question this run answers. It heads the report. |
| `--variants` | space-separated; options after a colon, comma-separated: `jev-check:threshold=0.8,jev=jev-1.13.0` |
| `--baseline` | the variant the others are compared with (default: the first) |
| `--rounds` | times each food is filled (default 3) |
| `--only "Big Mac,sandwich"` / `--kinds staple,branded` | a subset of foods |
| `--prompts-ref` | git ref to read `functions/src/ai-prompt.ts` from when it isn't in the working tree (default `origin/main`) |
| `--project` | Google Cloud project (default `goyaffle`) |
| `--concurrency` | foods in flight (default 3) |
| `--mock` | fake replies, to test the plumbing. Files get a `-mock` suffix and stay out of the index; delete them. |

Every variant takes `model` (Gemini model), `thinking` (`MINIMAL`, `LOW`, `MEDIUM`, `HIGH` or `none`) and `jev` (Jev model). Defaults are in `variants.mjs`.

With `GEMINI_API_KEY` set, it uses the Gemini Developer API instead of Vertex.

The run checks before spending anything that each variant can run: prompts for the cascade, a Jev key, the food table.

## What a run writes

- `docs/research/ai-bench/runs/<date>-<name>.json`: every call, with model, tokens, search queries, latency, cost and the parsed answer. Re-score it any time.
- `docs/research/ai-bench/<date>-<name>.md`: the report.
- A row in `docs/research/ai-bench/README.md`, the index of runs.

Re-make a report from the raw file (after a scoring change, say) with `node scripts/ai-bench/bench.mjs report <raw file>`. Hand-written takeaways are kept.

Every report has the same sections in the same order:

1. **Setup**: code commit, machine, food set version, rounds, baseline, prompt sources and hashes, the Jev version it resolved to, the food table, prices.
2. **Variants**: what each one does.
3. **Results**: cost per 1,000 fills, searches per fill, median and p90 latency, kcal within tolerance, mean kcal and macro error, right kind of reply, right search call, failures.
4. **Against the baseline**: paired differences per food with a 95% bootstrap interval. An interval that excludes zero is a real difference on this food set; one that crosses zero is not.
5. **By kind of food**: staples, brands, vague input.
6. **Search decisions**: brands not searched, searches wasted, router mix-ups.
7. **Food table**: hits, misses and wrong answers (table variants only).
8. **Per food**: median kcal for every variant next to the reference.
9. **Other checks**: kcal spread across rounds, the Atwater gap, imperial units in `servingText`.
10. **Takeaways**: written by hand after reading the numbers: what they show, what they don't, what to test next.

## Making runs comparable

- Within a run, a step with the same parameters runs once per food and round, and every variant that uses it gets the same answer. Two variants that share a first step differ only by what they do after it.
- Variants for one food run one after another in shuffled order, so time of day and API drift don't favour one.
- Comparisons are paired by food and averaged over rounds first, because rounds of one food are not independent.
- Between runs, compare only when the food set version (`FOODS_VERSION`) and prompt hashes match. Change either and say so in the purpose.
- Prices live in `lib/prices.mjs`. An unknown model stops the run instead of costing $0.

## The food set

`foods.mjs`: staples with USDA references, brands with label references, and vague input that should get a question. English, Spanish and German. Each food says which replies are acceptable (`accept`) and, where there's a reference, the tolerance.

When you add or change a food, bump `FOODS_VERSION`.

## The food table

`data/food-table.json` holds per-100 g values for about 50 common foods from USDA FoodData Central (SR Legacy), with portion weights. The list is in `data/food-table.spec.mjs`. Build or rebuild it with:

```sh
node scripts/ai-bench/data/build-food-table.mjs   # downloads about 12 MB from USDA
```

If a USDA description isn't found, the script lists near matches and stops. Fix the spec and run it again.

Table variants shortlist foods by name, ask Jev to pick one (or "none") and a portion, and compute the macros in code. A miss falls back to the cascade.

## Adding a variant

Add an entry to `VARIANTS` in `variants.mjs`: a one-line `describe` and a `run(steps, options)` that returns `{ result }` (a `MacroFillResult`), plus `route` for routers and `tableHit` or `tableMiss` for table lookups. Build it from the steps in `lib/steps.mjs`. If it needs a new kind of call, add a step there so its cost and latency are recorded.

## Layout

| Path | What it is |
| --- | --- |
| `bench.mjs` | command line: `list`, `run`, `report` |
| `variants.mjs` | the variants |
| `foods.mjs` | the labelled food set |
| `prompts.mjs` | router and checker prompts; loads the app's and the cascade's prompts |
| `lib/steps.mjs` | the calls variants are built from, shared per food and round |
| `lib/clients.mjs` | Gemini (Vertex or Developer API), Jev, mock |
| `lib/score.mjs` | metrics and the paired bootstrap |
| `lib/report.mjs` | the report |
| `lib/table.mjs` | food table lookup and portion maths |
| `lib/prices.mjs` | model and search prices |
| `data/` | the food table and its build script |
| `v1/` | the first router bench (3 Nov 2026), kept to reproduce `docs/research/ai-bench/2026-11-03-router.md` |

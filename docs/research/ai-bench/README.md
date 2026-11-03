# AI fill bench runs

Every bench run, newest first. Each report has the same sections (setup, variants, results, paired comparison with the baseline, by kind of food, search decisions, per food, takeaways), so runs can be compared side by side. How to run one: `scripts/ai-bench/README.md`.

| Date | Run | Purpose | Variants | Foods × rounds |
| --- | --- | --- | --- | --- |
| 2026-11-03 | [v2-first](2026-11-03-v2-first.md) | First v2 run: can the USDA food table with Jev answer staples as well as Gemini for less, and how do the cascade and Jev hybrids compare with today's fill on 3.5 and 3.1 Flash-Lite? | `today`, `no-search`, `cascade`, `jev-router`, `jev-cascade`, `table-jev`, `jev-table`, `cascade:model=gemini-3.1-flash-lite`, `today:model=gemini-3.1-flash-lite` | 57 × 3 |
| 2026-11-03 | [router](2026-11-03-router.md) | Bench v1: can a cheap router (Gemini or Jev) skip search on staples? Includes the real cascade re-run. | today, no search, cascade, Gemini router, Jev router, Jev yes/no, Jev cascade, Jev check | 36 × 3 |
| 2026-11-01 | [flash-lite](2026-11-01-flash-lite.md) | Browser bench: 3.1 against 3.5 Flash-Lite for the fill. | 3 configs | 10 × 3 |

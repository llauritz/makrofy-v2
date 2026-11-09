// Prices in USD, checked 3 Nov 2026. A model missing here makes the bench
// stop instead of reporting a cost of zero: add its price (with a source)
// before benchmarking it.
//
// The 5,000 free searches a month are ignored: at launch volume they run out
// early in the month, so every query is priced.

export const SEARCH_PER_QUERY = 0.014 // Grounding with Google Search, Gemini 3+: $14 per 1,000 queries

/** Per 1M tokens. Gemini output includes thinking tokens. */
export const MODEL_PRICES = {
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  // TypeSafe Jev: input only, output is free. jev-latest resolves to 1.14.0
  // as of 3 Nov 2026.
  "jev-latest": { input: 0.042, output: 0 },
  "jev-1.14.0": { input: 0.042, output: 0 },
  "jev-1.13.0": { input: 0.042, output: 0 },
  // Synthetic replies for --mock runs.
  "mock-gemini": { input: 0.3, output: 2.5 },
  "mock-jev": { input: 0.042, output: 0 },
}

export function priceOf(model) {
  const p = MODEL_PRICES[model]
  if (!p) throw new Error(`No price for model "${model}". Add it to scripts/ai-bench/lib/prices.mjs.`)
  return p
}

/** Cost of one call from its token usage and search queries. */
export function callCost(model, usage, queries = 0) {
  const p = priceOf(model)
  return (usage.input * p.input + usage.output * p.output) / 1e6 + queries * SEARCH_PER_QUERY
}

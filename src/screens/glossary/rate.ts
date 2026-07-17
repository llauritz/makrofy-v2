import { productRate } from "@/lib/glossary"
import type { Dictionary } from "@/lib/i18n"
import type { Product } from "@/lib/suggestions"

// A Product's one-line Rate string for display — "78 kcal each", "380 kcal /
// 100 g", or the em dash for a rate-less Product. The single source the Glossary
// row and the detail header both read, so the rate line reads the same in both
// (it was the numeric-only glossary.ts formatRate before #25 split the words
// into the dictionary; this keeps the composition in one place).
export function productRateLine(
  product: Product,
  t: Dictionary,
  n: (value: number) => string,
): string {
  const rate = productRate(product)
  return rate
    ? t.glossary.rateLine(n(rate.kcal), product.kind)
    : t.glossary.rateNone
}

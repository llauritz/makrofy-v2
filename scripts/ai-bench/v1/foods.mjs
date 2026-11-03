// The labelled food set for the router bench (scripts/ai-bench/run.mjs).
//
// `kind` is the route a good router should pick:
//   staple  – generic food or simple dish; standard food tables are enough, no search
//   branded – brand, chain or packaged product; the label or menu is the source of truth
//   vague   – too unclear to estimate; the right answer is one clarifying question
// `accept` lists the statuses that count as a correct reply for this food.
// `alsoOk` lists other routes that are defensible (e.g. Nutella is a brand, but
// its label is so well known that answering without a search is fine).
//
// `ref` is the reference for the portion as written: kcal, protein, fat, carbs
// in grams, plus `tol` (allowed relative kcal error). Staple references are
// USDA SR Legacy per-100 g values scaled to the portion; branded ones are
// from the label or the 1 Nov bench notes. Foods without a solid reference
// have no `ref` and are only scored on route, status and consistency.

const usda = "USDA SR Legacy"

export const FOODS = [
  // ── Staples ────────────────────────────────────────────────────────────
  { text: "1 banana", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 105, p: 1.3, f: 0.4, c: 27, tol: 0.12, src: `${usda}, medium 118 g` } },
  { text: "2 scrambled eggs with 10 g butter", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 215, p: 12.6, f: 17.6, c: 0.7, tol: 0.12, src: `${usda}, 2 large eggs 100 g + butter 10 g` } },
  { text: "200 g cooked white rice", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 260, p: 5.4, f: 0.6, c: 56.3, tol: 0.08, src: `${usda}, long-grain enriched, cooked` } },
  { text: "an apple", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 95, p: 0.5, f: 0.3, c: 25.1, tol: 0.2, src: `${usda}, medium 182 g with skin` } },
  { text: "150 g grilled chicken breast", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 248, p: 46.5, f: 5.4, c: 0, tol: 0.12, src: `${usda}, roasted, meat only` } },
  { text: "50 g oats with 250 ml whole milk", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 347, p: 14.7, f: 11.7, c: 46.3, tol: 0.1, src: `${usda}, oats dry + milk 3.25% (258 g)` } },
  { text: "200 g cooked spaghetti", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 316, p: 11.6, f: 1.9, c: 61.7, tol: 0.1, src: `${usda}, enriched pasta, cooked` } },
  { text: "30 g almonds", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 174, p: 6.3, f: 15, c: 6.5, tol: 0.08, src: `${usda}, raw` } },
  { text: "10 g olive oil", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 88, p: 0, f: 10, c: 0, tol: 0.08, src: usda } },
  { text: "200 g cooked lentils", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 232, p: 18, f: 0.8, c: 40.3, tol: 0.1, src: `${usda}, boiled` } },
  { text: "100 g avocado", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 160, p: 2, f: 14.7, c: 8.5, tol: 0.08, src: `${usda}, raw` } },
  { text: "20 g peanut butter", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 118, p: 5, f: 10.1, c: 3.9, tol: 0.1, src: `${usda}, smooth` } },
  // Same foods in the app's other languages: the router must not treat
  // Spanish or German wording as "regional, needs search".
  { text: "200 g de arroz blanco cocido", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 260, p: 5.4, f: 0.6, c: 56.3, tol: 0.08, src: `${usda}, long-grain enriched, cooked` } },
  { text: "una manzana", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 95, p: 0.5, f: 0.3, c: 25.1, tol: 0.2, src: `${usda}, medium 182 g with skin` } },
  { text: "2 Eier, gekocht", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 155, p: 12.6, f: 10.6, c: 1.1, tol: 0.15, src: `${usda}, hard-boiled, 2 large 100 g` } },
  { text: "30 g Mandeln", kind: "staple", accept: ["confident", "unsure"],
    ref: { kcal: 174, p: 6.3, f: 15, c: 6.5, tol: 0.08, src: `${usda}, raw` } },
  { text: "un café", kind: "staple", accept: ["confident", "unsure", "ambiguous"], alsoOk: ["vague"] },
  { text: "medialuna de manteca", kind: "staple", accept: ["confident", "unsure"], alsoOk: ["branded"] },

  // ── Branded, chain and packaged ────────────────────────────────────────
  { text: "Big Mac", kind: "branded", accept: ["confident", "unsure"],
    ref: { kcal: 563, p: 25, f: 30, c: 45, tol: 0.06, src: "540–590 kcal across markets (1 Nov bench)" } },
  { text: "Chobani vanilla greek yogurt 150 g", kind: "branded", accept: ["confident", "unsure"],
    ref: { kcal: 110, p: 12, f: 0, c: 15, tol: 0.1, src: "retailer label (1 Nov bench)" } },
  { text: "alfajor Havanna chocolate", kind: "branded", accept: ["confident", "unsure"],
    ref: { kcal: 206, p: 3.5, f: 7, c: 32, tol: 0.1, src: "FatSecret, 55 g (1 Nov bench)" } },
  { text: "Coca-Cola can 330 ml", kind: "branded", accept: ["confident", "unsure"],
    ref: { kcal: 139, p: 0, f: 0, c: 35, tol: 0.06, src: "EU label, 42 kcal per 100 ml" } },
  { text: "Snickers bar", kind: "branded", accept: ["confident", "unsure"],
    ref: { kcal: 250, p: 4, f: 12, c: 33, tol: 0.06, src: "US label, 52.7 g" } },
  { text: "3 Oreo cookies", kind: "branded", accept: ["confident", "unsure"],
    ref: { kcal: 160, p: 1, f: 7, c: 25, tol: 0.08, src: "US label, 34 g" } },
  { text: "100 g Haribo Goldbären", kind: "branded", accept: ["confident", "unsure"],
    ref: { kcal: 343, p: 6.9, f: 0.5, c: 77, tol: 0.06, src: "DE label" } },
  { text: "15 g Nutella", kind: "branded", accept: ["confident", "unsure"], alsoOk: ["staple"],
    ref: { kcal: 81, p: 0.9, f: 4.6, c: 8.6, tol: 0.08, src: "EU label, 539 kcal per 100 g" } },
  { text: "KFC original recipe chicken breast", kind: "branded", accept: ["confident", "unsure"],
    ref: { kcal: 390, p: 39, f: 21, c: 11, tol: 0.1, src: "KFC US menu" } },
  { text: "Starbucks grande oat milk latte", kind: "branded", accept: ["confident", "unsure"] },
  { text: "Red Bull 250 ml", kind: "branded", accept: ["confident", "unsure"] },

  // ── Vague: one question is the right reply ─────────────────────────────
  { text: "a bowl of pasta", kind: "vague", accept: ["ambiguous"] },
  { text: "sandwich", kind: "vague", accept: ["ambiguous"] },
  { text: "salad", kind: "vague", accept: ["ambiguous"] },
  { text: "pizza", kind: "vague", accept: ["ambiguous", "unsure"] },
  { text: "dinner", kind: "vague", accept: ["ambiguous", "hopeless"] },
  { text: "empanada de carne", kind: "vague", accept: ["ambiguous", "unsure"], alsoOk: ["staple"] },
  { text: "milanesa con papas fritas", kind: "vague", accept: ["ambiguous", "unsure"], alsoOk: ["staple"] },
]

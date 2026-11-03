# AI fill bench: table-verify (2026-11-03)

_Does a second Jev question (same food, same part, state and fat level) stop the table's false matches (egg whites, chicken with skin) without losing its correct staple answers? Main and held-out sets together._

## Setup

|  |  |
| --- | --- |
| Run | 2026-11-03T22:45:32.244Z |
| Code | bench-verify-run @ e1fe355 (uncommitted changes) |
| Machine | darwin arm64 · Node 24.14.1 · Gemini via vertex-global (goyaffle) |
| Foods | set main 2026-11-03b + held-out 2026-11-03: 91 foods (65 staples, 15 brands, 11 vague), 74 with a reference |
| Rounds | 3 (each food once per round; variants in shuffled order; a step shared by variants runs once per food and round) |
| Baseline | cascade |
| Prompt app | src/lib/macro-fill.ts SYSTEM_PROMPT · sha 85bafa0a0c |
| Prompt ROUTING_PROMPT | functions/src/ai-prompt.ts at origin/claude/project-thread-og8ogu (ef40609) ROUTING_PROMPT · sha 518fe09d14 |
| Prompt SEARCH_PROMPT | functions/src/ai-prompt.ts at origin/claude/project-thread-og8ogu (ef40609) SEARCH_PROMPT · sha 7dfb21ea67 |
| Prompt SYSTEM_PROMPT | functions/src/ai-prompt.ts at origin/claude/project-thread-og8ogu (ef40609) SYSTEM_PROMPT · sha 85bafa0a0c |
| Jev | not used |
| Food table | USDA FoodData Central, SR Legacy (April 2018) · 50 foods |
| Prices | search $14 per 1,000 queries; jev-latest $0.042/$0 per 1M in/out; gemini-3.5-flash-lite $0.3/$2.5 per 1M in/out |

## Variants

| Variant | What it does |
| --- | --- |
| `cascade` | Two-step fill from functions/src/ai-prompt.ts: ROUTING_PROMPT without search answers or hands over; SEARCH_PROMPT with search runs only after a hand-over. |
| `table-jev` | Our USDA food table first: Jev picks the food and portion and code does the sums; a miss (no match, "none", Jev unsure, not a single food) falls back to the cascade. Option verify=0.5 adds a Jev check that the pick is the same food in the same state. |
| `table-jev:verify=0.5` | Our USDA food table first: Jev picks the food and portion and code does the sums; a miss (no match, "none", Jev unsure, not a single food) falls back to the cascade. Option verify=0.5 adds a Jev check that the pick is the same food in the same state. |
| `table-jev:verify=0.7` | Our USDA food table first: Jev picks the food and portion and code does the sums; a miss (no match, "none", Jev unsure, not a single food) falls back to the cascade. Option verify=0.5 adds a Jev check that the pick is the same food in the same state. |

## Results

| Variant | Per 1,000 fills | Searches per fill | Median | p90 | kcal within tolerance | Mean kcal error | Mean macro error | Right kind of reply | Right search call | Failed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cascade` | $4.44 | 0.27 | 1.30 s | 3.47 s | 202/222 | 3.8% | 0.6 g | 100% | 100% | 0 |
| `table-jev` | $4.29 | 0.27 | 1.32 s | 3.48 s | 209/222 | 2.5% | 0.5 g | 100% | 100% | 0 |
| `table-jev:verify=0.5` | $4.30 | 0.27 | 1.32 s | 3.47 s | 209/222 | 2.5% | 0.5 g | 100% | 100% | 0 |
| `table-jev:verify=0.7` | $4.30 | 0.27 | 1.33 s | 3.48 s | 206/222 | 2.9% | 0.5 g | 100% | 100% | 0 |

Mean macro error is the mean absolute error of protein, fat and carbs in grams against the reference. Right search call: a search step for brands, none for staples and vague input (foods where either is defensible always count as right).

## Against `cascade`

Differences are per food (averaged over rounds), with a 95% bootstrap interval over foods. An interval that excludes zero is a real difference on this food set.

| Variant | Cost per 1,000 fills | Mean latency | kcal within tolerance | Right kind of reply |
| --- | --- | --- | --- | --- |
| `table-jev` | −$0.15 (−$0.20 to −$0.10) | −0.27 s (−0.38 s to −0.16 s) | +3 pts (±0 pts to +7 pts) | ±0 pts (±0 pts to ±0 pts) |
| `table-jev:verify=0.5` | −$0.14 (−$0.19 to −$0.09) | −0.19 s (−0.29 s to −0.10 s) | +3 pts (±0 pts to +7 pts) | ±0 pts (±0 pts to ±0 pts) |
| `table-jev:verify=0.7` | −$0.14 (−$0.18 to −$0.09) | −0.18 s (−0.28 s to −0.09 s) | +2 pts (±0 pts to +5 pts) | ±0 pts (±0 pts to ±0 pts) |

## By kind of food

| Variant | Kind | Per 1,000 | Searched | Median | kcal within tolerance | Mean kcal error | Right kind of reply |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `cascade` | staple | $0.75 | 2% | 1.28 s | 170/189 | 4.2% | 100% |
| `cascade` | branded | $23.30 | 100% | 3.47 s | 32/33 | 1.1% | 100% |
| `cascade` | vague | $0.50 | 0% | 1.25 s | – | – | 100% |
| `table-jev` | staple | $0.54 | 2% | 1.22 s | 177/189 | 2.8% | 100% |
| `table-jev` | branded | $23.31 | 100% | 3.48 s | 32/33 | 1.1% | 100% |
| `table-jev` | vague | $0.50 | 0% | 1.28 s | – | – | 100% |
| `table-jev:verify=0.5` | staple | $0.56 | 2% | 1.23 s | 177/189 | 2.8% | 100% |
| `table-jev:verify=0.5` | branded | $23.31 | 100% | 3.47 s | 32/33 | 1.1% | 100% |
| `table-jev:verify=0.5` | vague | $0.50 | 0% | 1.28 s | – | – | 100% |
| `table-jev:verify=0.7` | staple | $0.56 | 2% | 1.25 s | 174/189 | 3.2% | 100% |
| `table-jev:verify=0.7` | branded | $23.31 | 100% | 3.48 s | 32/33 | 1.1% | 100% |
| `table-jev:verify=0.7` | vague | $0.50 | 0% | 1.28 s | – | – | 100% |

## Search decisions

| Variant | Right search call | Brands not searched | Searches wasted | Router mix-ups |
| --- | --- | --- | --- | --- |
| `cascade` | 100% | 0 | 0 | – |
| `table-jev` | 100% | 0 | 0 | – |
| `table-jev:verify=0.5` | 100% | 0 | 0 | – |
| `table-jev:verify=0.7` | 100% | 0 | 0 | – |

## Food table

`table-jev`: answered from the table on 85 of 273 tries; 3 of those were outside tolerance (200 g de pechuga de pollo asada con piel → 330 kcal, 200 g).

Misses: jev: none 78, jev unsure 9, no candidates 99, jev: not a single food 2.

False matches on the held-out set (foods not in the table): 3 of 102 tries: 200 g de pechuga de pollo asada con piel → chicken-breast-cooked (330 kcal, reference 394).

`table-jev:verify=0.5`: answered from the table on 82 of 273 tries; 0 of those were outside tolerance.

Misses: jev: none 78, no candidates 99, jev: not a single food 2, jev unsure 9, jev: not the same food 3.

False matches on the held-out set (foods not in the table): 0 of 102 tries.

`table-jev:verify=0.7`: answered from the table on 80 of 273 tries; 0 of those were outside tolerance.

Misses: jev: none 78, jev unsure 8, jev: not the same food 6, no candidates 99, jev: not a single food 2.

False matches on the held-out set (foods not in the table): 0 of 102 tries.

## Per food

Median kcal over rounds. `?2` = asked a question twice, `s` = searched at least once, `t` = answered from the food table at least once.

| Food | Kind | Reference | `cascade` | `table-jev` | `table-jev:verify=0.5` | `table-jev:verify=0.7` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 banana | staple | 105 ±12% | 105 | 105 t | 105 t | 105 t |
| 2 scrambled eggs with 10 g butter | staple | 215 ±12% | 224 | 224 | 224 | 224 |
| 200 g cooked white rice | staple | 260 ±8% | 260 | 260 t | 260 t | 260 t |
| an apple | staple | 95 ±20% | 95 | 95 t | 95 t | 95 t |
| 150 g grilled chicken breast | staple | 248 ±12% | 248 | 248 t | 248 t | 248 t |
| 50 g oats with 250 ml whole milk | staple | 347 ±10% | 350 | 350 | 350 | 350 |
| 200 g cooked spaghetti | staple | 316 ±10% | 318 | 316 t | 316 t | 316 t |
| 30 g almonds | staple | 174 ±8% | 174 | 174 t | 174 t | 174 t |
| 10 g olive oil | staple | 88 ±8% | 88 | 88 t | 88 t | 88 t |
| 200 g cooked lentils | staple | 232 ±10% | 230 | 232 t | 232 t | 232 t |
| 100 g avocado | staple | 160 ±8% | 160 | 160 t | 160 t | 160 t |
| 20 g peanut butter | staple | 118 ±10% | 118 | 120 t | 120 t | 120 t |
| 200 g de arroz blanco cocido | staple | 260 ±8% | 260 | 260 t | 260 t | 260 t |
| una manzana | staple | 95 ±20% | 95 | 95 t | 95 t | 95 t |
| 2 Eier, gekocht | staple | 155 ±15% | 143 | 155 t | 155 t | 155 t |
| 30 g Mandeln | staple | 174 ±8% | 174 | 174 t | 174 t | 174 t |
| un café | staple | – | ?3 | 3 ?2 t | 3 ?2 t | 3 ?1 t |
| medialuna de manteca | staple | – | 230 s | 230 s | 230 s | 230 s |
| 250 ml whole milk | staple | 157 ±10% | 150 | 157 t | 157 t | 157 t |
| 300 ml de leche entera | staple | 188 ±10% | 186 | 188 t | 188 t | 188 t |
| 150 g plain nonfat Greek yogurt | staple | 89 ±10% | 87 | 89 t | 89 t | 89 t |
| 100 g raw salmon | staple | 208 ±12% | 208 | 208 t | 208 t | 208 t |
| 200 g boiled potatoes | staple | 174 ±12% | 174 | 174 t | 174 t | 174 t |
| 150 g cooked chickpeas | staple | 246 ±10% | 243 | 246 t | 246 t | 246 t |
| eine Banane | staple | 105 ±15% | 105 | 105 t | 105 t | 105 t |
| 20 g butter | staple | 143 ±8% | 144 | 143 t | 143 t | 143 t |
| 100 g firm tofu | staple | 144 ±15% | 83 | 144 t | 144 t | 144 t |
| a black coffee | staple | 2 ±5 | 2 | 2 t | 2 t | 2 t |
| a kiwi | staple | 42 ±25% | 42 | 42 t | 42 t | 42 t |
| un huevo frito | staple | 90 ±20% | 90 | 90 t | 90 t | 90 t |
| half an avocado | staple | 161 ±25% | 120 | 161 t | 161 t | 120 |
| Big Mac | branded | 563 ±6% | 540 s | 540 s | 540 s | 540 s |
| Chobani vanilla greek yogurt 150 g | branded | 110 ±10% | 110 s | 110 s | 110 s | 110 s |
| alfajor Havanna chocolate | branded | 206 ±10% | 210 s | 210 s | 210 s | 210 s |
| Coca-Cola can 330 ml | branded | 139 ±6% | 139 s | 139 s | 139 s | 139 s |
| Snickers bar | branded | 250 ±6% | 250 s | 250 s | 250 s | 250 s |
| 3 Oreo cookies | branded | 160 ±8% | 160 s | 160 s | 160 s | 160 s |
| 100 g Haribo Goldbären | branded | 343 ±6% | 343 s | 343 s | 343 s | 343 s |
| 15 g Nutella | branded | 81 ±8% | 80 s | 80 s | 80 s | 80 s |
| KFC original recipe chicken breast | branded | 390 ±10% | 390 s | 390 s | 390 s | 390 s |
| Starbucks grande oat milk latte | branded | – | 240 s | 240 s | 240 s | 240 s |
| Red Bull 250 ml | branded | 115 ±6% | 115 s | 115 s | 115 s | 115 s |
| Coca-Cola Zero 330 ml | branded | 1 ±3 | 1 s | 1 s | 1 s | 1 s |
| Milka Alpenmilch 100 g | branded | – | 530 s | 530 s | 530 s | 530 s |
| Quilmes Cristal 1 litro | branded | – | 410 s | 410 s | 410 s | 410 s |
| McDonald's medium fries | branded | – | 320 s | 320 s | 320 s | 320 s |
| a bowl of pasta | vague | – | ?3 | ?3 | ?3 | ?3 |
| sandwich | vague | – | ?3 | ?3 | ?3 | ?3 |
| salad | vague | – | ?3 | ?3 | ?3 | ?3 |
| pizza | vague | – | ?3 | ?3 | ?3 | ?3 |
| dinner | vague | – | ?3 | ?3 | ?3 | ?3 |
| empanada de carne | vague | – | 300 | 300 | 300 | 300 |
| milanesa con papas fritas | vague | – | 650 | 650 | 650 | 650 |
| leftovers | vague | – | ?3 | ?3 | ?3 | ?3 |
| una porción de torta | vague | – | ?3 | ?3 | ?3 | ?3 |
| smoothie | vague | – | ?3 | ?3 | ?3 | ?3 |
| Curry | vague | – | ?3 | ?3 | ?3 | ?3 |
| 250 g full-fat Greek yogurt | staple | 243 ±10% | 245 | 245 | 245 | 245 |
| 80 g dry spaghetti | staple | 297 ±10% | 288 | 288 | 288 | 288 |
| 70 g uncooked white rice | staple | 256 ±10% | 250 | 250 | 250 | 250 |
| 50 g dry lentils | staple | 176 ±10% | 176 | 176 | 176 | 176 |
| 250 ml unsweetened almond milk | staple | 38 ±25% | 30 | 30 | 30 | 30 |
| 10 g peanut oil | staple | 88 ±8% | 88 | 88 | 88 | 88 |
| 100 g egg whites | staple | 52 ±12% | 52 | 52 | 52 | 52 |
| 2 rice cakes | staple | 70 ±20% | 70 | 70 | 70 | 70 |
| 1 butter croissant | staple | 231 ±20% | 231 | 231 | 231 | 231 |
| 60 g rye bread | staple | 155 ±10% | 150 | 150 | 150 | 150 |
| 150 g roast turkey breast | staple | 221 ±12% | 222 | 222 | 222 | 222 |
| 200 g de pechuga de pollo asada con piel | staple | 394 ±10% | 330 | 330 t | 330 | 330 |
| 100 g Räucherlachs | staple | 117 ±15% | 117 | 117 | 117 | 117 |
| 200 ml de jugo de naranja | staple | 94 ±15% | 90 | 90 | 90 | 90 |
| 50 g hummus | staple | 119 ±20% | 166 | 166 | 166 | 166 |
| 30 g cream cheese | staple | 105 ±12% | 105 | 105 | 105 | 105 |
| 150 g cottage cheese | staple | 147 ±15% | 147 | 147 | 147 | 147 |
| 200 g grilled sirloin steak | staple | 356 ±15% | 320 | 320 | 320 | 320 |
| 150 g cooked shrimp | staple | 179 ±12% | 148 | 148 | 148 | 148 |
| 150 g baked cod | staple | 158 ±12% | 123 | 123 | 123 | 123 |
| 185 g cooked quinoa | staple | 222 ±10% | 222 | 222 | 222 | 222 |
| 150 g cooked couscous | staple | 168 ±10% | 167 | 167 | 167 | 167 |
| 30 g feta | staple | 80 ±10% | 75 | 75 | 75 | 75 |
| 20 g grated parmesan | staple | 84 ±12% | 85 | 85 | 85 | 85 |
| 30 g cashews | staple | 166 ±8% | 165 | 165 | 165 | 165 |
| 20 g sunflower seeds | staple | 117 ±8% | 116 | 116 | 116 | 116 |
| 20 g dark chocolate, 70–85% | staple | 120 ±10% | 120 | 120 | 120 | 120 |
| 30 g raisins | staple | 90 ±8% | 90 | 90 | 90 | 90 |
| 150 g pineapple | staple | 75 ±15% | 75 | 75 | 75 | 75 |
| 300 g watermelon | staple | 90 ±20% | 90 | 90 | 90 | 90 |
| 100 g champiñones | staple | 22 ±30% | 22 | 22 | 22 | 22 |
| 150 g Erbsen, gekocht | staple | 117 ±12% | 123 | 123 | 123 | 123 |
| 1 Brezel | staple | 389 ±25% | 350 | 350 | 350 | 350 |
| 2 cucharadas de dulce de leche | staple | 120 ±30% | 130 | 130 | 130 | 130 |

## Other checks

| Variant | kcal spread across rounds (median) | Atwater gap (median) | Imperial units in servingText |
| --- | --- | --- | --- |
| `cascade` | 0.0% | 2.3% | 1 |
| `table-jev` | 0.0% | 2.4% | 1 |
| `table-jev:verify=0.5` | 0.0% | 2.4% | 1 |
| `table-jev:verify=0.7` | 0.0% | 2.4% | 1 |

Spread: (max − min) / median kcal of a food over rounds. Atwater gap: |4P + 4C + 9F − kcal| / kcal.

## Takeaways

_Written after review: what the numbers show, what they don't, and what to test next._

Raw calls: `docs/research/ai-bench/runs/2026-11-03-table-verify.json`. Re-make this report with `node scripts/ai-bench/bench.mjs report docs/research/ai-bench/runs/2026-11-03-table-verify.json`.

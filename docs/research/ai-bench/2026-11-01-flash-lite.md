# AI fill bench — 2026-11-01 — 3.1 Flash-Lite vs 3.5 Flash-Lite

_Run by the owner on the live domain (`goyaffle.web.app/ai-bench.html`, real App Check), 3 rounds × 10 foods × 3 configs = 90 calls, configs interleaved per food. Production request shape: Vertex `global` backend, Google Search grounding + four-tier `responseSchema` in one call, `SYSTEM_PROMPT` as of commit 98256e9. Latency is measured in the browser, so it includes the network round trip from Argentina._

To compare another model later, add it to `CONFIGS` in `src/dev/ai-bench.ts`, run the same foods, and diff against the raw tables below. Keep the prompt the same, or note the commit it changed in.

## Takeaways

- **Reliability:** 0 errors and 0 off-contract replies on all three configs. `gemini-3.5-flash-lite` works on the production stack.
- **Speed:** about the same. Median 3.13 s (3.1) · 3.08 s (3.5 default) · 2.87 s (3.5 LOW). The p90 improves more (5.16 → 4.91 → 4.41 s). Grounded calls take about 3 s and ungrounded about 1.85 s on every model, so **whether the model searches matters more than which model runs**.
- **Thought tokens were 0 on every call**, so LOW doesn't speed things up by cutting reasoning. Its edge is that it **searched less**: 23 of 30 calls grounded, vs 28 (3.5 default) and 29 (3.1).
- **Staples are searched anyway.** The prompt says not to search for plain staples, yet banana, eggs and rice were grounded on most calls (3.1: 8 of 9; 3.5 default: 7 of 9; LOW: 4 of 9). Each of those calls costs a search and about 1 s, and makes the Search chip show.
- **Runaway searches happen on both models:** 3.1 ran 37 queries over 37.7 s ("a bowl of pasta") and 13 queries over 20.6 s (empanada). 3.5 default ran 16 and 10 queries over about 13.5 s (Starbucks latte). 3.5 LOW peaked at 7 queries over 9.0 s. Search is billed per query, so one 37-query fill costs about $0.52 once the free 5,000 are used up.
- **Quality:** the numbers mostly agree (banana, rice, yogurt, Big Mac). 3.5 is **more consistent**: Big Mac 540 kcal on 6 of 6 calls (3.1: 563/570/540), Havanna alfajor 55 g / 210 kcal on 6 of 6 (3.1: 47 g/208, 47 g/178, 55 g/208). It's also **more decisive**: 3.1 marked a plain banana "unsure" twice and the Starbucks latte "unsure" twice. 3.5's clarifying questions are cleaner ("What kind of sandwich is it?" vs 3.1's two-part questions).
- **3.5's weak spot:** the Starbucks latte. It ran many searches and its macros changed between calls (P3 F5 C28 at 210 kcal doesn't add up: 3·4 + 5·9 + 28·4 ≈ 169 kcal).
- **Vague food handling:** "a bowl of pasta" was all over the place on 3.1 and 3.5 default (3.1 once invented marinara at 500 kcal; 3.5 default once said "confident" for plain pasta at 310 kcal). 3.5 LOW asked a question on 3 of 3 calls, which is the intended behaviour. On "empanada de carne", 3.1 always asked a question, while 3.5 mostly gave an "unsure" estimate of about 250 kcal (3.5 default had a 433 kcal outlier).
- **Imperial units leak into `servingText`:** "16 fl oz", "about 2 cups", "7" to 7-7/8" long".
- **Butter eggs reference:** 2 large eggs ≈ 143 kcal / 9.5 g fat, plus 10 g butter ≈ 72 kcal / 8.1 g fat, gives about 215 kcal / 17.6 g fat. Estimates of 215–225 kcal are right. The 242–254 kcal answers (fat 20–22 g) came from all three configs.

### Per-config numbers

| | 3.1 default | 3.5 default | 3.5 LOW |
| --- | --- | --- | --- |
| Median / mean ms | 3131 / 5012 | 3076 / 3981 | 2869 / 3200 |
| Slowest call ms | 37727 | 13745 | 9032 |
| Total search queries | 84 | 59 | 40 |
| Calls with no search | 1 | 2 | 7 |
| Search fee per fill after the free tier (at $14/1k) | $0.039 | $0.028 | $0.019 |

- **Paired latency** (same food and round, median difference, 5,000-sample bootstrap 95% CI): 3.1 vs 3.5 default is a tie (−16 ms, CI −258 to 241). 3.5 LOW beats 3.5 default by 350 ms (CI 162 to 869) and 3.1 by 153 ms (CI 25 to 571).
- With 30 calls per config, treat rare events (runaway searches, no-search counts) as direction, not measurement.
- 3.1's clarifying questions were two-part on most calls. The prompt asks for one short question.

### Accuracy checks

These references come from retailer pages and a user-entered database, not manufacturer pages, so treat them as rough.

| Food | Reference | 3.1 default | 3.5 default | 3.5 LOW |
| --- | --- | --- | --- | --- |
| Chobani vanilla 150 g | 110 kcal, P12 F0 C15 ([retailer label](https://www.shoprite.com/product/chobani-greek-nonfat-vanilla-yogurt-53-oz-id-00894700010021)) | 1 of 3 | 3 of 3 | 2 of 3 |
| Havanna chocolate alfajor | 55 g, about 206 kcal, P3.5 F7 C32 ([FatSecret](https://www.fatsecret.es/calor%C3%ADas-nutrici%C3%B3n/havanna/alfajor-de-chocolate/1-alfajor)) | 1 of 3 | 3 of 3 | 3 of 3 |

- **Big Mac: no winner.** Published figures vary by market ([McDonald's Singapore](https://www.mcdonalds.com.sg/food-menu/big-mac) lists 558 kcal). Every answer falls in the 540 to 580 kcal range seen in third-party databases.
- **Starbucks latte: no winner.** I found no US figure. The [Starbucks Austria sheet](https://starbucks.at/sites/starbucks-at/files/2024-11/AT%20Beverage%20Nutrition%20Holiday.pdf) lists 181 kcal for that market's recipe, so the 210 to 230 kcal answers may run high.

**Verdict:** keep `gemini-3.5-flash-lite` at LOW (live since #94). The bigger wins are in the prompt and request: stop searching for staples, and cap runaway searches.

## Summary

| Config | Calls | Errors | Median ms | p90 ms | Grounded median ms | Ungrounded median ms | Grounded calls | Avg thought tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.1 Flash-Lite · default | 30 | 0 | 3131 | 5155 | 3173 | 1955 | 29 | 0 |
| 3.5 Flash-Lite · default | 30 | 0 | 3076 | 4913 | 3100 | 1850 | 28 | 0 |
| 3.5 Flash-Lite · LOW | 30 | 0 | 2869 | 4405 | 2968 | 1839 | 23 | 0 |

## Raw calls

| Food | Config | ms | Status | Grounded | Queries | Thoughts | Answer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 banana | 3.1 Flash-Lite · default | 5155 | confident | yes | 1 | 0 | banana, medium · 1 medium (118 g) · 105 kcal · P1.3 F0.4 C27 |
| 1 banana | 3.5 Flash-Lite · default | 3118 | confident | yes | 1 | 0 | Banana · 1 medium (118 g) · 105 kcal · P1.3 F0.4 C27 |
| 1 banana | 3.5 Flash-Lite · LOW | 2247 | confident |  | 0 | 0 | Banana · 1 medium banana · 105 kcal · P1.3 F0.3 C27 |
| 2 scrambled eggs with 10 g butter | 3.1 Flash-Lite · default | 3346 | confident | yes | 2 | 0 | 2 scrambled eggs with 10g butter · 2 large eggs (approx. 100g) with 10g butter · 218 kcal · P12.6 F17.5 C1.5 |
| 2 scrambled eggs with 10 g butter | 3.5 Flash-Lite · default | 3109 | confident | yes | 1 | 0 | Scrambled eggs with butter · 2 scrambled eggs with 10 g butter · 215 kcal · P12.6 F17.5 C0.8 |
| 2 scrambled eggs with 10 g butter | 3.5 Flash-Lite · LOW | 1839 | confident |  | 0 | 0 | Scrambled eggs with butter · 2 eggs with 10 g butter · 242 kcal · P12.8 F20.1 C1.2 |
| 200 g cooked white rice | 3.1 Flash-Lite · default | 3070 | confident | yes | 1 | 0 | cooked white rice · 200 g · 260 kcal · P5 F0.5 C56 |
| 200 g cooked white rice | 3.5 Flash-Lite · default | 3176 | confident | yes | 1 | 0 | Cooked white rice · 200 g · 260 kcal · P5.4 F0.6 C57.4 |
| 200 g cooked white rice | 3.5 Flash-Lite · LOW | 2968 | confident | yes | 1 | 0 | Cooked white rice · 200 g · 260 kcal · P5.4 F0.6 C57.4 |
| Big Mac | 3.1 Flash-Lite · default | 3855 | confident | yes | 1 | 0 | McDonald's Big Mac · 1 burger (approx. 216g) · 563 kcal · P25 F32 C45 |
| Big Mac | 3.5 Flash-Lite · default | 3020 | confident | yes | 1 | 0 | McDonald's Big Mac · 1 burger · 540 kcal · P25 F28 C46 |
| Big Mac | 3.5 Flash-Lite · LOW | 2858 | confident | yes | 1 | 0 | McDonald's Big Mac · 1 burger · 540 kcal · P25 F28 C46 |
| Starbucks grande oat milk latte | 3.1 Flash-Lite · default | 3423 | confident | yes | 1 | 0 | Starbucks Grande Oat Milk Latte · 16 fl oz (Grande) · 230 kcal · P6.1 F11.1 C31.9 |
| Starbucks grande oat milk latte | 3.5 Flash-Lite · default | 13745 | confident | yes | 16 | 0 | Starbucks Grande Caffè Latte with Oatmilk · 1 grande (16 fl oz) · 230 kcal · P3 F9 C28 |
| Starbucks grande oat milk latte | 3.5 Flash-Lite · LOW | 9032 | confident | yes | 7 | 0 | Starbucks Grande Caffè Latte with Oatmilk · 1 grande (16 fl oz) · 210 kcal · P3 F5 C28 |
| alfajor Havanna chocolate | 3.1 Flash-Lite · default | 3078 | confident | yes | 1 | 0 | Havanna Chocolate Alfajor · 1 unit (approx. 47g) · 208 kcal · P3 F6.8 C34 |
| alfajor Havanna chocolate | 3.5 Flash-Lite · default | 3110 | confident | yes | 1 | 0 | Havanna Chocolate Alfajor · 1 unit (approx. 55g) · 210 kcal · P3 F7 C33 |
| alfajor Havanna chocolate | 3.5 Flash-Lite · LOW | 4405 | confident | yes | 2 | 0 | Havanna Chocolate Alfajor · 1 alfajor (55 g) · 210 kcal · P3 F7 C33 |
| Chobani vanilla greek yogurt 150 g | 3.1 Flash-Lite · default | 2852 | confident | yes | 1 | 0 | Chobani Vanilla Nonfat Greek Yogurt · 1 container (150 g) · 110 kcal · P14 F0 C15 |
| Chobani vanilla greek yogurt 150 g | 3.5 Flash-Lite · default | 3160 | confident | yes | 2 | 0 | Chobani Vanilla Nonfat Greek Yogurt · 150 g · 110 kcal · P12 F0 C15 |
| Chobani vanilla greek yogurt 150 g | 3.5 Flash-Lite · LOW | 4275 | confident | yes | 3 | 0 | Chobani Vanilla Nonfat Greek Yogurt · 1 container (150 g) · 110 kcal · P12 F0 C15 |
| empanada de carne | 3.1 Flash-Lite · default | 20642 | ambiguous | yes | 13 | 0 | ? Was the beef empanada baked or fried, and roughly how much did it weigh? |
| empanada de carne | 3.5 Flash-Lite · default | 3011 | ambiguous | yes | 1 | 0 | ? How many empanadas did you have, and roughly what size were they? |
| empanada de carne | 3.5 Flash-Lite · LOW | 2693 | unsure | yes | 1 | 0 | Empanada de carne (beef empanada) · 1 medium (approx. 90g) · 260 kcal · P10 F13 C25 |
| a bowl of pasta | 3.1 Flash-Lite · default | 3409 | ambiguous | yes | 1 | 0 | ? What type of sauce is on your pasta and how much would you estimate is in the bowl? |
| a bowl of pasta | 3.5 Flash-Lite · default | 3010 | unsure | yes | 1 | 0 | Cooked regular pasta · 1 medium bowl (about 2 cups cooked) · 420 kcal · P14 F2 C84 |
| a bowl of pasta | 3.5 Flash-Lite · LOW | 1756 | ambiguous |  | 0 | 0 | ? What kind of pasta and sauce is in the bowl? |
| sandwich | 3.1 Flash-Lite · default | 2919 | ambiguous | yes | 1 | 0 | ? What type of sandwich is it, and what are its main ingredients? |
| sandwich | 3.5 Flash-Lite · default | 2761 | ambiguous | yes | 1 | 0 | ? What kind of sandwich is it? |
| sandwich | 3.5 Flash-Lite · LOW | 2898 | ambiguous | yes | 1 | 0 | ? What kind of sandwich is it? |
| 1 banana | 3.1 Flash-Lite · default | 3057 | unsure | yes | 1 | 0 | banana · 1 medium banana (approx. 118 g) · 105 kcal · P1.3 F0.4 C27 |
| 1 banana | 3.5 Flash-Lite · default | 2813 | confident | yes | 1 | 0 | Banana · 1 medium (118 g) · 105 kcal · P1.3 F0.4 C27 |
| 1 banana | 3.5 Flash-Lite · LOW | 2806 | confident | yes | 1 | 0 | Banana · 1 medium (7" to 7-7/8" long) · 105 kcal · P1.3 F0.4 C27 |
| 2 scrambled eggs with 10 g butter | 3.1 Flash-Lite · default | 1955 | confident |  | 0 | 0 | Scrambled eggs with butter · 2 large eggs scrambled with 10g butter · 225 kcal · P12.5 F18.5 C1.2 |
| 2 scrambled eggs with 10 g butter | 3.5 Flash-Lite · default | 2794 | confident | yes | 1 | 0 | Scrambled eggs with butter · 2 large eggs with 10 g butter · 254 kcal · P12.6 F21.5 C0.8 |
| 2 scrambled eggs with 10 g butter | 3.5 Flash-Lite · LOW | 1927 | confident |  | 0 | 0 | Scrambled eggs with butter · 2 eggs with 10 g butter · 224 kcal · P12.6 F18.8 C1.2 |
| 200 g cooked white rice | 3.1 Flash-Lite · default | 3194 | confident | yes | 1 | 0 | Cooked white rice · 200 g · 260 kcal · P5 F0.5 C56 |
| 200 g cooked white rice | 3.5 Flash-Lite · default | 2754 | confident | yes | 1 | 0 | Cooked white rice · 200 g · 260 kcal · P5.4 F0.4 C57.2 |
| 200 g cooked white rice | 3.5 Flash-Lite · LOW | 1719 | confident |  | 0 | 0 | Cooked white rice · 200 g · 260 kcal · P5.4 F0.4 C57.2 |
| Big Mac | 3.1 Flash-Lite · default | 2970 | confident | yes | 1 | 0 | McDonald's Big Mac · 1 burger (216g) · 570 kcal · P24 F32 C46 |
| Big Mac | 3.5 Flash-Lite · default | 2865 | confident | yes | 1 | 0 | McDonald's Big Mac · 1 burger · 540 kcal · P25 F28 C46 |
| Big Mac | 3.5 Flash-Lite · LOW | 3230 | confident | yes | 1 | 0 | McDonald's Big Mac · 1 burger · 540 kcal · P25 F28 C46 |
| Starbucks grande oat milk latte | 3.1 Flash-Lite · default | 2761 | unsure | yes | 1 | 0 | Starbucks Grande Oat Milk Latte · 16 fl oz (Grande) · 230 kcal · P6 F11 C32 |
| Starbucks grande oat milk latte | 3.5 Flash-Lite · default | 13366 | confident | yes | 10 | 0 | Starbucks Grande Caffè Latte with Oatmilk · 1 grande (16 fl oz) · 230 kcal · P6.1 F11.1 C31.9 |
| Starbucks grande oat milk latte | 3.5 Flash-Lite · LOW | 5442 | confident | yes | 4 | 0 | Starbucks Grande Oat Milk Latte · 1 grande (16 fl oz) · 230 kcal · P3 F9 C28 |
| alfajor Havanna chocolate | 3.1 Flash-Lite · default | 2792 | confident | yes | 1 | 0 | Havanna chocolate alfajor · 1 unit (47 g) · 178 kcal · P2.9 F5.6 C28.7 |
| alfajor Havanna chocolate | 3.5 Flash-Lite · default | 2907 | confident | yes | 1 | 0 | Havanna Chocolate Alfajor · 1 unit (approx. 55g) · 210 kcal · P3 F7 C33 |
| alfajor Havanna chocolate | 3.5 Flash-Lite · LOW | 2839 | confident | yes | 1 | 0 | Havanna Chocolate Alfajor · 1 unit (approx. 55g) · 210 kcal · P3 F7 C33 |
| Chobani vanilla greek yogurt 150 g | 3.1 Flash-Lite · default | 2890 | confident | yes | 1 | 0 | Chobani Vanilla Non-Fat Greek Yogurt · 1 container (150 g) · 110 kcal · P12 F0 C15 |
| Chobani vanilla greek yogurt 150 g | 3.5 Flash-Lite · default | 4913 | confident | yes | 2 | 0 | Chobani Vanilla Greek Yogurt · 1 container (150 g) · 110 kcal · P12 F0 C15 |
| Chobani vanilla greek yogurt 150 g | 3.5 Flash-Lite · LOW | 3944 | confident | yes | 2 | 0 | Chobani Vanilla Greek Yogurt · 1 container (150 g) · 110 kcal · P12 F0 C15 |
| empanada de carne | 3.1 Flash-Lite · default | 3015 | ambiguous | yes | 1 | 0 | ? Was your beef empanada baked or fried, and was it a standard size or a large one? |
| empanada de carne | 3.5 Flash-Lite · default | 3076 | unsure | yes | 2 | 0 | Beef empanada · 1 medium (approx. 130 g) · 433 kcal · P15.7 F25 C36 |
| empanada de carne | 3.5 Flash-Lite · LOW | 2887 | unsure | yes | 1 | 0 | Empanada de carne (beef empanada) · 1 medium (approx. 90g) · 250 kcal · P10 F12 C26 |
| a bowl of pasta | 3.1 Flash-Lite · default | 37727 | confident | yes | 37 | 0 | Pasta with marinara sauce · 1 bowl (approx. 350g) · 500 kcal · P18 F14 C75 |
| a bowl of pasta | 3.5 Flash-Lite · default | 2892 | confident | yes | 1 | 0 | Cooked plain pasta · 1 medium bowl (approx. 1.5 cups / 200g) · 310 kcal · P10.5 F1.7 C61.5 |
| a bowl of pasta | 3.5 Flash-Lite · LOW | 1932 | ambiguous |  | 0 | 0 | ? What kind of pasta and sauce was it, and roughly how large was the portion? |
| sandwich | 3.1 Flash-Lite · default | 3250 | ambiguous | yes | 1 | 0 | ? What type of sandwich is it, and roughly how much does it weigh? |
| sandwich | 3.5 Flash-Lite · default | 3100 | ambiguous | yes | 1 | 0 | ? What kind of sandwich is it? |
| sandwich | 3.5 Flash-Lite · LOW | 2869 | ambiguous | yes | 1 | 0 | ? What kind of sandwich is it? |
| 1 banana | 3.1 Flash-Lite · default | 3173 | unsure | yes | 1 | 0 | medium banana · 1 medium (approx. 118g) · 105 kcal · P1.3 F0.4 C27 |
| 1 banana | 3.5 Flash-Lite · default | 2054 | confident |  | 0 | 0 | Medium Banana · 1 medium (118g) · 105 kcal · P1.3 F0.3 C27 |
| 1 banana | 3.5 Flash-Lite · LOW | 1831 | confident |  | 0 | 0 | Banana · 1 medium (approx. 118g) · 105 kcal · P1.3 F0.3 C27 |
| 2 scrambled eggs with 10 g butter | 3.1 Flash-Lite · default | 3056 | confident | yes | 2 | 0 | 2 large scrambled eggs with 10 g butter · 2 large eggs (approx. 100g raw) and 10g butter · 254 kcal · P12.6 F22 C1.2 |
| 2 scrambled eggs with 10 g butter | 3.5 Flash-Lite · default | 1850 | confident |  | 0 | 0 | Scrambled eggs with butter · 2 eggs with 10 g butter · 242 kcal · P12.8 F20.5 C1.2 |
| 2 scrambled eggs with 10 g butter | 3.5 Flash-Lite · LOW | 2817 | confident | yes | 1 | 0 | 2 scrambled eggs with 10 g butter · 2 large eggs and 10 g butter · 221 kcal · P12.6 F18.3 C0.8 |
| 200 g cooked white rice | 3.1 Flash-Lite · default | 3578 | confident | yes | 1 | 0 | Cooked white rice · 200 g · 260 kcal · P5.4 F0.6 C56 |
| 200 g cooked white rice | 3.5 Flash-Lite · default | 3761 | confident | yes | 1 | 0 | Cooked white rice · 200 g · 260 kcal · P5.4 F0.6 C57.2 |
| 200 g cooked white rice | 3.5 Flash-Lite · LOW | 2974 | confident | yes | 1 | 0 | Cooked white rice · 200 g · 260 kcal · P5.4 F0.6 C56.4 |
| Big Mac | 3.1 Flash-Lite · default | 3034 | confident | yes | 1 | 0 | McDonald's Big Mac · 1 burger · 540 kcal · P25 F28 C46 |
| Big Mac | 3.5 Flash-Lite · default | 3376 | confident | yes | 1 | 0 | McDonald's Big Mac · 1 burger · 540 kcal · P25 F28 C46 |
| Big Mac | 3.5 Flash-Lite · LOW | 2965 | confident | yes | 1 | 0 | McDonald's Big Mac · 1 burger · 540 kcal · P25 F28 C46 |
| Starbucks grande oat milk latte | 3.1 Flash-Lite · default | 3193 | unsure | yes | 1 | 0 | Starbucks Grande Oatmilk Latte · 16 fl oz (Grande) · 230 kcal · P6.1 F11.1 C31.9 |
| Starbucks grande oat milk latte | 3.5 Flash-Lite · default | 4350 | confident | yes | 3 | 0 | Starbucks Grande Caffè Latte with Oatmilk · 1 grande (16 fl oz) · 230 kcal · P6 F11 C32 |
| Starbucks grande oat milk latte | 3.5 Flash-Lite · LOW | 6170 | confident | yes | 5 | 0 | Starbucks Grande Caffè Latte with Oatmilk · 1 Grande (16 fl oz) · 210 kcal · P5 F5 C27 |
| alfajor Havanna chocolate | 3.1 Flash-Lite · default | 5729 | confident | yes | 6 | 0 | Havanna chocolate alfajor · 1 unit (55 g) · 208 kcal · P3 F6.7 C34 |
| alfajor Havanna chocolate | 3.5 Flash-Lite · default | 2951 | confident | yes | 2 | 0 | Havanna Chocolate Alfajor · 1 alfajor (55g) · 210 kcal · P3 F6.9 C33 |
| alfajor Havanna chocolate | 3.5 Flash-Lite · LOW | 2570 | confident | yes | 1 | 0 | Havanna Chocolate Alfajor · 1 unit (55g) · 210 kcal · P3 F7 C33 |
| Chobani vanilla greek yogurt 150 g | 3.1 Flash-Lite · default | 3581 | confident | yes | 1 | 0 | Chobani Vanilla Greek Yogurt · 1 container (150 g) · 107 kcal · P14 F0 C15 |
| Chobani vanilla greek yogurt 150 g | 3.5 Flash-Lite · default | 3914 | confident | yes | 2 | 0 | Chobani vanilla greek yogurt · 150 g · 110 kcal · P12 F0 C15 |
| Chobani vanilla greek yogurt 150 g | 3.5 Flash-Lite · LOW | 3043 | confident | yes | 1 | 0 | Chobani Vanilla Greek Yogurt · 150 g container · 120 kcal · P14 F0 C16 |
| empanada de carne | 3.1 Flash-Lite · default | 3131 | ambiguous | yes | 1 | 0 | ? Was the empanada baked or fried, and what size was it? |
| empanada de carne | 3.5 Flash-Lite · default | 3724 | unsure | yes | 1 | 0 | Empanada de carne · 1 medium empanada · 250 kcal · P9 F13 C25 |
| empanada de carne | 3.5 Flash-Lite · LOW | 3030 | ambiguous | yes | 1 | 0 | ? How many beef empanadas did you have? |
| a bowl of pasta | 3.1 Flash-Lite · default | 3554 | ambiguous | yes | 1 | 0 | ? How much pasta was in the bowl, and did it have any sauce or toppings? |
| a bowl of pasta | 3.5 Flash-Lite · default | 8148 | ambiguous | yes | 1 | 0 | ? How large is the bowl and does it have any sauce? |
| a bowl of pasta | 3.5 Flash-Lite · LOW | 3376 | ambiguous | yes | 1 | 0 | ? How large was the bowl of pasta, and was there any sauce? |
| sandwich | 3.1 Flash-Lite · default | 2965 | ambiguous | yes | 1 | 0 | ? What kind of sandwich was it, and do you know the approximate weight or size? |
| sandwich | 3.5 Flash-Lite · default | 2594 | ambiguous | yes | 1 | 0 | ? What kind of sandwich is it? |
| sandwich | 3.5 Flash-Lite · LOW | 2656 | ambiguous | yes | 1 | 0 | ? What kind of sandwich is it? |

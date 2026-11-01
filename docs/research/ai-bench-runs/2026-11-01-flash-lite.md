# AI bench run: 2026-11-01, Flash-Lite 3.1 vs 3.5

Baseline for later model comparisons, so 3.1 and 3.5 don't need another run.

## Run details

- **Code and prompt:** commit `98256e9` (#94). A changed `SYSTEM_PROMPT` or response schema makes these numbers a weaker baseline, so check `src/lib/macro-fill.ts` first.
- **Size:** 3 rounds × 10 foods × 3 configs = 90 calls, no errors, 183 search queries. Configs were interleaved per food, so network drift hits them alike and calls can be compared in pairs.
- **Where it ran:** not recorded in the export. Almost certainly the live site, which went up 9 minutes before the results arrived. It ran from one browser at one time of day.
- **To compare a new model:** add it to `CONFIGS` in `src/dev/ai-bench.ts`, keep `FOODS` as is, run 3 rounds at `/ai-bench.html`, and save the export next to this file.

## Findings

| | 3.1 default | 3.5 default | 3.5 LOW |
| --- | --- | --- | --- |
| Median / mean ms | 3131 / 5012 | 3076 / 3981 | 2869 / 3200 |
| Slowest call ms | 37727 | 13745 | 9032 |
| Total search queries | 84 | 59 | 40 |
| Calls with no search | 1 | 2 | 7 |
| Calls with 2+ searches | 5 | 8 | 6 |
| Search fee per fill after the free tier | $0.039 | $0.028 | $0.019 |
| Same status in all 3 rounds | 7 of 10 foods | 8 of 10 foods | 9 of 10 foods |

- **Same answers on clear foods.** Banana, rice and the label-backed brands land within a few percent on every config.
- **Vague foods are the real difference.** On "a bowl of pasta", LOW asked a question 3 of 3 times. 3.1 and 3.5 default sometimes invented an answer and marked it confident (37 searches for "marinara", 500 kcal; "plain pasta", 310 kcal).
- **Clarifying questions.** The prompt asks for one short question. Two-part questions: 3.1 in 8 of 8, 3.5 default in 2 of 5, LOW in 2 of 7.
- **3.5 repeats itself better on brands.** Big Mac was 540 kcal in 6 of 6 calls, against 540 to 570 on 3.1. The alfajor was 55 g in 6 of 6 calls, while 3.1 gave 47 g twice and ranged from 178 to 208 kcal.
- **3.1 raises false doubt, 3.5 can be overconfident.** 3.1 marked a banana "unsure" twice. 3.5 was always "confident" on the Starbucks latte, yet its numbers moved.
- **Latency follows search count.** No search takes about 1.9 s, one search about 3 s, and each further search about 1 s more. Model speed barely matters next to this.
- **Speed differences are small.** 3.1 vs 3.5 default is a tie (paired difference 36 ms, 95% CI -246 to 308). LOW beats 3.5 default by 350 ms (CI 176 to 869) and 3.1 by 208 ms (CI 48 to 571).
- **Search-count differences are suggestive only.** 7 vs 2 no-search calls for LOW vs 3.5 default gives p = 0.15. The 3.1 total is inflated by two runaway calls (37 and 13 searches), and one 37-search call would cost $0.52 after the free tier.
- **Thought tokens can't show what LOW does.** They read 0 on all 90 calls, so either the API doesn't report them here or no thinking happened. LOW's effect is only visible through behaviour.

### Problems on every config

- **Runaway searches.** 3.5 never used fewer than 3 searches on the Starbucks latte (16, 10, 3 on default; 7, 4, 5 on LOW, 4.4 to 13.7 s), while 3.1 used 1 each time.
- **Staples still search.** The prompt says not to search for them, but they stayed search-free in only 1, 2 and 5 of 9 calls.
- **Macros that don't add up.** One LOW latte answer says 210 kcal with P3 F5 C28, which adds up to about 169 kcal. Nothing checks this before the fill is shown. Some gap is normal (a banana's fibre explains about 12 kcal).
- **Eggs wander.** 2 eggs with 10 g butter range from 215 to 254 kcal on every config, and a simple sum (about 143 + 72 kcal, from memory of USDA values) says about 215.

### Accuracy checks

Calls matching published figures. Sources are retailer pages and user-entered databases, not manufacturer pages, so treat them as rough.

| Food | Reference | 3.1 default | 3.5 default | 3.5 LOW |
| --- | --- | --- | --- | --- |
| Chobani vanilla 150 g | 110 kcal, P12 F0 C15 ([retailer label](https://www.shoprite.com/product/chobani-greek-nonfat-vanilla-yogurt-53-oz-id-00894700010021)) | 1 of 3 | 3 of 3 | 2 of 3 |
| Havanna chocolate alfajor | 55 g, about 206 kcal, P3.5 F7 C32 ([FatSecret](https://www.fatsecret.es/calor%C3%ADas-nutrici%C3%B3n/havanna/alfajor-de-chocolate/1-alfajor)) | 1 of 3 | 3 of 3 | 3 of 3 |

- **Big Mac: no winner.** Published figures vary by market, and I couldn't get the US page ([McDonald's Singapore](https://www.mcdonalds.com.sg/food-menu/big-mac) lists 558 kcal). Every answer sits near the 540 to 580 kcal range in third-party databases.
- **Starbucks latte: no winner.** I found no US figure. The [Starbucks Austria sheet](https://starbucks.at/sites/starbucks-at/files/2024-11/AT%20Beverage%20Nutrition%20Holiday.pdf) lists 181 kcal for a different market's recipe, so all the answers (210 to 230 kcal) may run high.

### Verdict

Keep 3.5 Flash-Lite at LOW. It is the fastest, searches least, handles vague foods best, and matches 3.1 or better on every food that could be checked. With 30 calls per config, treat the differences in rare events as direction, not measurement.

## Raw export

### Summary

| Config | Calls | Errors | Median ms | p90 ms | Grounded median ms | Ungrounded median ms | Grounded calls | Avg thought tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3.1 Flash-Lite · default | 30 | 0 | 3131 | 5155 | 3173 | 1955 | 29 | 0 |
| 3.5 Flash-Lite · default | 30 | 0 | 3076 | 4913 | 3100 | 1850 | 28 | 0 |
| 3.5 Flash-Lite · LOW | 30 | 0 | 2869 | 4405 | 2968 | 1839 | 23 | 0 |

### Calls

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

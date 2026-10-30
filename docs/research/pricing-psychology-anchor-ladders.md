# Pricing Psychology (Anchor Ladders) & AI-Fill Unit Economics — Research Note

_Scope: feeds ticket #60 "Pricing & billing cadence" for the Yaffle subscription (wayfinder #58). Takes #59's decisions as fixed — free 10 fills trial-framed, Premium 1,000 fills/month, top "anchor" tier ~10,000 fills/month silently capped — and researches (a) what the evidence actually says about three-option anchor/decoy ladders for consumer subscriptions, and (b) the unit economics of the decided allowances against candidate price points, including MoR fee drag. Researched 2026-07-17 against primary papers, current pricing pages, and industry datasets; prices will drift. This note informs — the final numbers are #60's call._

---

## TL;DR / Recommendations

- **Grounding price re-verified today (2026-07-17): unchanged.** Gemini 3 series: "5,000 prompts per month (free, shared across Gemini 3)" project-wide, then **$14 / 1,000 search queries** ([Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)). ≈ **$0.014/fill** if one fill triggers one search query — but note the paid meter is **per search query, not per prompt**; a fill that triggers 2 queries costs $0.028. Instrument queries-per-fill telemetry before committing prices.
- **The anchor's job as a *reference price* rests on solid evidence; its job as a *decoy* does not.** Anchoring (Tversky & Kahneman 1974) replicates robustly (confirmed in Many Labs); the asymmetric-dominance/decoy effect (Huber, Payne & Puto 1982) largely **fails in the field** — Frederick, Lee & Baskin (2014) found it only with numeric stimuli, Yang & Lynn (2014) got 11 reliable effects in 91 attempts. Plan for a *modest* lift from the high tier, not Ariely's 84/16 classroom result.
- **Two mitigating facts favor our ladder anyway:** (1) a pricing table *is* numeric stimuli — the one condition where attraction effects do survive; (2) our display is Free / Premium / Top, making Premium the **middle option** — the compromise effect (Simonson 1989) and centre-stage effect (Rodway et al. 2012) both push toward the middle, and these are better-supported than pure decoys.
- **Real consumer-app ladders cluster at a 1.25×–2.3× top-to-middle price multiple** (MyFitnessPal 1.25×, Duolingo 1.75–2.3×, Whoop 1.8×). Usage-multiple tiers — the closest analog to ours — run higher (ChatGPT Pro = 5×/10× Plus for "5x/20x more usage"). **Evidence supports 2.5×–3× for our anchor**; beyond ~4× it stops reading as a sibling plan and starts reading as a different product.
- **A maxed-out anchor subscriber is a heavy loss at any consumer price.** 10,000 fills ≈ **$140/month COGS**; break-even monthly price would be **≈ $148/month**. The 10k cap is **not an economic backstop — it is a loss-bounding device against abuse**. The economics are protected by the usage distribution (consumption is power-law; human food-logging plausibly tops out ~300–600 novel fills/month) plus the per-user rate limits from the subscription note. Price the anchor for the *plausible-human* worst case (~600 fills ≈ $8.40/mo COGS): **$11.99/mo clears it; $9.99/mo roughly breaks even.**
- **Premium's 1,000-fill cap is also marketing, not economics.** Break-even at candidate prices is 110–300 fills/month — far below the cap. Blended profitability rests entirely on the distribution (median plausibly 30–80 fills). Expected margins are healthy at **$3.99/mo or $29.99/yr**; **$19.99/yr is dangerously thin** (net $1.54/mo ≈ 110 fills of headroom).
- **MoR fixed fee decides the cadence question.** At 5% + $0.50/transaction, a $2.99 monthly charge loses **21.7%** to fees; $29.99 annual loses **6.7%**. Twelve monthly charges pay $6.00/year in fixed fees alone vs $0.50 once. **Anchor the paywall on annual (shown as monthly-equivalent), keep monthly as a deliberately premium-priced low-commitment door** — which itself anchors the annual price.
- **Keep .99 endings.** Field experiments show 9-endings lift demand (Anderson & Simester 2003), and RevenueCat's 2026 dataset shows **$9.99/mo is the "structural anchor"** of subscription pricing; health & fitness clusters at $9.99/mo and ~$39.94/yr — Yaffle deliberately prices below both.
- **Risk note — "abundance copy + silent cap" is a documented enforcement pattern.** The FTC's AT&T case ($60M settlement: "unlimited" plans, silently throttled) and the CMA's Online Choice Architecture paper ("hidden information") both bear on marketing abundance while silently capping. Avoiding the word "unlimited" (already decided) helps but is not a full shield. **Recommend disclosing the 10,000 number in a findable fair-use line** (pricing-page footnote or ToS), keeping only the *marketing* copy abundance-framed.

---

## 1. What #59 already fixed (context, not re-litigated)

Three options on the paywall, differing **only in AI-fill allowance**: Free = 10 fills, trial-framed, silent monthly reset. Premium = 1,000 fills/month, the intended purchase. Top tier = the expensive anchor, abundance copy without the word "unlimited", code-capped ~10,000/month. Counters monthly, no grandfathering. Payment via a Merchant of Record — Paddle (5% + $0.50) or Polar (5% + 50¢ free tier; 3.8% + 40¢ on the $20/mo Pro plan) — per the [subscription research note](subscription-gating.md) (§2.4, not yet on main at time of writing). What #60 must set: the two price points, the gap, and monthly-vs-annual cadence.

---

## 2. Part (a) — what the evidence says about anchor ladders

### 2.1 The lab canon

| Effect | Source | Finding |
|---|---|---|
| **Asymmetric dominance ("decoy")** | Huber, Payne & Puto 1982, *JCR* 9(1):90–98, [doi:10.1086/208899](https://doi.org/10.1086/208899) | Adding an option dominated by target A (but not by competitor B) raises A's choice share — violating regularity. Lab, hypothetical choices. |
| **Anchoring** | Tversky & Kahneman 1974, *Science* 185:1124–1131, [doi:10.1126/science.185.4157.1124](https://doi.org/10.1126/science.185.4157.1124) | Arbitrary high numbers drag subsequent estimates upward. One of the most robust effects in the literature — strongly replicated in the Many Labs project (Klein et al. 2014, [doi:10.1027/1864-9335/a000178](https://doi.org/10.1027/1864-9335/a000178)). |
| **Compromise effect** | Simonson 1989, *JCR* 16(2):158–174, [doi:10.1086/209205](https://doi.org/10.1086/209205) | When uncertain, people pick the middle option — it's the easiest choice to justify. |
| **Centre-stage effect** | Rodway, Schepman & Lambert 2012, *Appl. Cognit. Psychol.* 26(2):215–222, [doi:10.1002/acp.1812](https://doi.org/10.1002/acp.1812) | Spatially middle options are preferred even among near-identical items. |
| **The Economist experiment** | Ariely, *Predictably Irrational* (2008), ch. 1 ([summary](https://whistlinginthewind.org/2013/01/11/predictably-irrational-chapter-1-the-truth-about-relativity/)) | Web $59 / print $125 / print+web $125: split 16/0/84. Remove the decoy: 68/32. **Caveat: a classroom exercise with 100 MIT students choosing hypothetically — not a field A/B by The Economist.** Its magnitude has never been reproduced in the field. |

### 2.2 The replication record — the honest read

The decoy effect's field record is poor, and this is the single most important calibration for #60:

- **Frederick, Lee & Baskin 2014, "The Limits of Attraction"** (*JMR* 51(4):487–507, [doi:10.1509/jmr.12.0061](https://doi.org/10.1509/jmr.12.0061)): across many product categories, attraction effects appeared **only when stimuli were represented numerically** — with verbal descriptions, photos, or real products the effect vanished. Their conclusion: boundary conditions are so restrictive that practical validity is questionable.
- **Yang & Lynn 2014, "More Evidence Challenging the Robustness and Usefulness of the Attraction Effect"** (*JMR*, [doi:10.1509/jmr.14.0020](https://doi.org/10.1509/jmr.14.0020)): **91 attempts across 23 product classes produced only 11 reliable effects** — barely above chance with qualitative/pictorial stimuli.
- **The original authors' reply** — Huber, Payne & Puto 2014, "Let's Be Honest About the Attraction Effect" (*JMR* 51(4):520–525, [doi:10.1509/jmr.14.0208](https://doi.org/10.1509/jmr.14.0208), [PDF](https://people.duke.edu/~jch8/bio/Papers/HuberPaynePutoJMR%202014.pdf)) — concedes the effect needs specific conditions: numeric attributes, weak prior preferences, easily-detected dominance, low involvement.

**When does a high anchor lift the middle tier, and when does it just add friction?** Synthesizing both sides:

- *Lift is likely when:* options are described by **numbers** (price, fills/month — exactly our table); buyers have **no strong prior** on what an AI-fill allowance is worth (true — this is a novel quantity); the relationship between tiers is **instantly legible** (10× fills for ~3× price).
- *Friction/backfire is likely when:* the extra tier forces genuine deliberation (mitigated by keeping it to 2 paid options); the anchor looks like a manipulation (pure same-price decoys — not our design); or buyers infer unfairness from the gap (see §2.5).
- **Anchoring ≠ decoy.** Even where the decoy *choice-share* effect fails, the top tier still functions as a reference price that makes Premium's number feel small — and anchoring is the robust half of the literature. Design for anchoring (top tier visible, plausible, real), hope for compromise (Premium in the middle), and don't bank on asymmetric dominance.

### 2.3 Industry evidence for subscription apps

**RevenueCat, State of Subscription Apps 2026** (primary data: 115,000+ apps, $16B revenue, 1B+ transactions — [report](https://www.revenuecat.com/state-of-subscription-apps), [10-minute summary](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026/)):

- **Hard paywalls convert ~5× better than freemium** (10.7% vs 2.1% download-to-paid by day 35) with similar year-1 retention — supports #59's tight 10-fill trial framing.
- **AI apps earn a 41% year-1 LTV premium but retain worse**: 12-month retention on annual plans 21.1% (AI) vs 30.7% (non-AI); AI monthly plans retain 36% worse than traditional apps. Cadence implication: annual plans lock in revenue that monthly AI churn would leak.
- **"Annual subscriptions aren't the guarantee you think they are"** — over ⅓ of annual subscribers cancel auto-renewal within the first month (they still pay the year; renewal is the risk point).
- **Pricing clusters hard on charm points**: $9.99 monthly is the "structural anchor" across categories; **health & fitness clusters at $9.99/mo and $39.94/yr median** (via [Airbridge's category breakdown of the same dataset](https://www.airbridge.io/en/blog/subscription-app-pricing-by-category-2026-benchmark)).

**Adapty (15,000+ apps dataset)** ([paywall experiments playbook](https://adapty.io/blog/paywall-experiments-playbook/)): pricing experiments are the highest-leverage paywall change (up to ~80% revenue uplift vs ~30% for visual redesigns); only 28% of pricing A/Bs improve conversion, but winners lift LTV ~46% on average — i.e. **test, expect most variants to lose, keep the winner**. Apps that added an annual option alongside monthly saw 15–25% of new subscribers choose annual.

**Tier count** — the often-quoted claim that **3-tier pricing pages convert ~1.4× 2-tier pages (and 4+ converts worse)** traces to Price Intelligently/ProfitWell and circulates via secondary syntheses ([example](https://www.digitalapplied.com/blog/subscription-pricing-page-psychology-decision-framework-2026)); I could not locate the primary experiment write-up — **treat as a directional pointer, not established fact**. Paddle's own CRO playbook recommends: with 3 tiers, make the middle the explicit "best value", and if using a decoy price it ~10–20% above the target option ([Paddle CRO playbook](https://www.paddle.com/blog/app-cro-playbook-for-2025)). No published, named 2-vs-3-paid-tier consumer A/B with hard numbers was found (searched RevenueCat, Adapty, Superwall, Airbridge) — the honest state of the art is "2–3 options, middle highlighted, more is worse".

**Choice overload** is real but applies at larger set sizes (Iyengar & Lepper 2000, [doi:10.1037/0022-3514.79.6.995](https://doi.org/10.1037/0022-3514.79.6.995)) and is itself contested (Scheibehenne et al. 2010 meta-analysis found a mean effect near zero, [doi:10.1086/651235](https://doi.org/10.1086/651235)). Three options is safely below any overload threshold.

### 2.4 Real ladders surveyed 2026-07-17

| App | Middle tier (the one they want you to buy) | Top tier (anchor) | Top ÷ middle | What differs |
|---|---|---|---|---|
| MyFitnessPal | Premium $19.99/mo · $79.99/yr | Premium+ $24.99/mo · $99.99/yr | **1.25×** | +meal planner ([MFP blog](https://blog.myfitnesspal.com/myfitnesspal-membership-pricing-tiers/), [premium page](https://www.myfitnesspal.com/premium)) |
| Duolingo | Super $12.99/mo · $95.99/yr | Max $29.99/mo · $167.99/yr | **2.31× / 1.75×** | +AI features (Video Call, Roleplay) ([pricing roundup](https://languageappguide.com/pricing/duolingo-cost/)) |
| ChatGPT | Plus $20/mo | Pro $100/mo ("5x more usage") and $200/mo ("20x more usage") | **5× / 10×** | pure usage multiples ([chatgpt.com/pricing](https://chatgpt.com/pricing/), [Pro tiers help](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers)) |
| Whoop | One $199/yr (Peak $239/yr) | Life $359/yr | **1.8×** (Life÷One) | +medical-grade hardware ([whoop.com/membership](https://www.whoop.com/us/en/membership/)) |

Readings for #60:

- **Consumer apps keep the multiple modest: 1.25×–2.3×.** The 5×–10× multiples exist only where the top tier is *genuinely bought for real usage* by prosumers (ChatGPT Pro) — those are revenue tiers, not decoys.
- **ChatGPT is the closest structural analog** — tiers differing only in usage multiples — and note its ratio: 5×/20× the usage for 5×/10× the price, i.e. **the top tier is *better* per-unit value**. Our 10× fills at 2.5–3× price follows the same convention; buyers accept it because the constraint is their need, not the per-unit rate.
- MyFitnessPal's 1.25× gap is too small to anchor — Premium+ reads as an upsell, not a reference price. Duolingo's 2.3× monthly gap is a working anchor (Max is widely discussed as overpriced, which *is the anchor doing its job* — while still being a real product Duolingo happily sells).

### 2.5 When anchors backfire — and the silent-cap risk note

- **Cannibalization is not free for us.** In classic decoy theory, people buying the anchor is upside. Our anchor has **real worst-case COGS (~$140/month, §3.5)** — an anchor buyer who actually consumes is a loss at any consumer price. The mitigation is behavioral (10,000 fills/month ≈ 333/day is not human food-logging; see §3.7) plus the per-user rate limits already specced in the [subscription note §4](subscription-gating.md). But #60 must accept: **every anchor sale carries bounded-loss tail risk, priced in §3.**
- **Price-fairness perception.** A pure decoy (feature-identical, dominated, meant never to be bought) invites "fake tier" accusations and review-bombing when noticed — and pricing-table screenshots travel. Ours is **differentiated (10× allowance), genuinely purchasable, and better per-fill value** — the defensible kind. Keep it that way; never let the anchor be strictly dominated.
- **Regulatory/consumer-protection angle on "abundance copy + silent cap"** (brief, as a risk note):
  - **FTC v. AT&T Mobility**: "unlimited" data plans silently throttled after a threshold → **$60M settlement**, refunds to 3.5M+ customers ([FTC case page](https://www.ftc.gov/legal-library/browse/cases-proceedings/122-3253-att-mobility-llc-mobile-data-service), [2024 refunds press release](https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-sends-refunds-former-att-wireless-customers-who-were-subject-data-throttling)). The theory was FTC Act §5 deception: the *material limitation* wasn't adequately disclosed. Not using the word "unlimited" (decided in #59) reduces but does not eliminate exposure — "all the AI you'll ever need" with a secret 10k cutoff rhymes with the same pattern.
  - **FTC, "Bringing Dark Patterns to Light" (2022)** ([report](https://www.ftc.gov/reports/bringing-dark-patterns-light)) and **CMA, "Online Choice Architecture" discussion paper (CMA155, 2022)** ([gov.uk](https://www.gov.uk/government/publications/online-choice-architecture-how-digital-design-can-harm-competition-and-consumers), [PDF](https://assets.publishing.service.gov.uk/media/624c27c68fa8f527710aaf58/Online_choice_architecture_discussion_paper.pdf)) both flag **hidden information / hidden limitations** as harmful practices; the CMA taxonomy's "choice information" category covers exactly this.
  - **Practical mitigation (recommended):** put the actual number in a findable place — a pricing-page footnote or fair-use clause ("fair use: 10,000 fills/month") — while keeping marketing copy abundance-framed. A disclosed generous cap is a fair-use policy; an undisclosed one is a dark pattern. This costs nothing psychologically: 10,000 *is* abundance.

### 2.6 Practical guidance the evidence supports

1. **Gap size: 2.5×–3×.** Below 2× the anchor doesn't create contrast (MFP's 1.25×); at 4×+ you're outside the consumer cluster and the tiers stop reading as siblings. Paddle's 10–20%-above-target decoy advice applies to same-product decoys, not differentiated tiers — the real-ladder survey is the better guide here.
2. **Charm endings: yes.** Field evidence: $9-endings raised demand in all three of Anderson & Simester's catalog experiments, strongest for unfamiliar items ([doi:10.1023/A:1023581927405](https://link.springer.com/article/10.1023/A:1023581927405)) — and a new app's AI allowance is maximally unfamiliar. Category convention (RevenueCat: $9.99 structural anchor; ProfitWell's caveat that 9-endings can attract lower-retention customers is noted but is a second-order effect at these price points, [via](https://www.getmonetizely.com/articles/the-power-of-rounding-why-99-vs-100-matters-in-saas-pricing-strategy)).
3. **Cadence framing: annual-first, monthly-equivalent display.** Show annual plans as "$2.49/mo billed annually" next to the monthly price — the monthly price then anchors the annual (Duolingo: Super $12.99/mo vs $8/mo-equivalent annual). This is doubly supported by unit economics (§3.2: fixed-fee amortization) and by RevenueCat's AI-retention data (§2.3: AI monthly churn is brutal; annual banks the year). Guard the known annual risk (⅓ cancel auto-renew in month 1) with a renewal-reminder email rather than by avoiding annual.
4. **Feature-identical vs differentiated anchor:** the lab tested feature-identical decoys; the field evidence for them is weak and the fairness risk real (§2.5). **Ours is already differentiated (allowance only) — that is the right design**, consistent with the strongest real-world analog (ChatGPT's usage tiers). No change recommended.
5. **Placement:** show three options with Premium in the **middle** and visually highlighted ("best value") — compromise + centre-stage push the same direction as the anchor, and this is the best-replicated part of the stack.

---

## 3. Part (b) — unit economics of the decided allowances

### 3.1 Verified cost facts (as of 2026-07-17)

- **Grounding, Gemini 3 series (Developer API): "5,000 prompts per month (free, shared across Gemini 3)", then "$14 / 1,000 search queries"** ([Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)). **Matches the 2026-07-10 research note — no price change.** The free pool is **project-wide** (all users share it), and the free meter counts *prompts* while the paid meter counts *search queries* — a prompt can trigger >1 query ([grounding doc](https://ai.google.dev/gemini-api/docs/google-search)). All tables below assume **1 fill = 1 query = $0.014**; a measured average of e.g. 1.5 queries/fill shrinks every break-even below by ⅓. The [Firebase AI Logic pricing page](https://firebase.google.com/docs/ai-logic/pricing) confirms cost follows the chosen Gemini provider's pricing — no separate AI Logic fee.
- **Tokens are noise:** Gemini 3.1 Flash-Lite at $0.25/M input, $1.50/M output (verified today, same page); a fill is ~400 in / ~200 out ≈ **$0.0004** — 3% of the grounding fee. Ignored below.
- **MoR fees:** Paddle 5% + $0.50; Polar free tier 5% + 50¢, Polar Pro ($20/mo flat) 3.8% + 40¢ (per the [subscription note §2.4](subscription-gating.md), verified 2026-07-17). Tables use 5% + $0.50.
- **Tax caveat (flag for #60, not modeled):** if consumer prices are displayed tax-inclusive (normal consumer UX in UK/EU), VAT (~20%) is extracted from the sticker price *before* the seller's share — a further ~17% off gross in those markets. Tables below are tax-exclusive (US-style sticker).

### 3.2 MoR fee drag: monthly vs annual

| Plan price | Fee (5% + $0.50) | Net | Net/month | Fee drag |
|---|---|---|---|---|
| $2.99/mo | $0.65 | $2.34 | $2.34 | **21.7%** |
| $3.99/mo | $0.70 | $3.29 | $3.29 | 17.5% |
| $4.99/mo | $0.75 | $4.24 | $4.24 | 15.0% |
| $9.99/mo | $1.00 | $8.99 | $8.99 | 10.0% |
| $11.99/mo | $1.10 | $10.89 | $10.89 | 9.2% |
| $14.99/mo | $1.25 | $13.74 | $13.74 | 8.3% |
| $19.99/yr | $1.50 | $18.49 | $1.54 | **7.5%** |
| $24.99/yr | $1.75 | $23.24 | $1.94 | 7.0% |
| $29.99/yr | $2.00 | $27.99 | $2.33 | 6.7% |
| $39.99/yr | $2.50 | $37.49 | $3.12 | 6.3% |
| $79.99/yr | $4.50 | $75.49 | $6.29 | 5.6% |
| $99.99/yr | $5.50 | $94.49 | $7.87 | 5.5% |

The fixed 50¢ is the whole story at the bottom of the price range: **12 monthly charges pay $6.00/year in fixed fees vs $0.50 once for annual.** A $2.99 monthly plan hands the MoR a fifth of revenue; the same money annualized hands over ~7%. This is the strongest single argument for annual-first cadence. (Polar Pro trims each row by ~1.2pp + 10¢ — material only past ~$1.5–2k/mo revenue, per the subscription note.)

### 3.3 Usage scenarios and per-user COGS

Usage assumption (labeled estimate): AI fill serves **novel** foods — repeats ride pins/suggestions/glossary for free — so even devoted loggers need few fills once their staples are known. Consumption features follow power-law distributions: a small share of users (5–15%) consume most of the resource, heavy users run ~8–10× the median ([softwarepricing.com on AI credits](https://softwarepricing.com/blog/credit-based-pricing-ai/), [Freemius](https://freemius.com/blog/ai-app-pricing-model/)); RevenueCat's AI-cost guidance likewise notes AI usage is "more repetitive than most teams expect" and recommends caps precisely because of heavy-tail users ([RevenueCat](https://www.revenuecat.com/blog/growth/ai-feature-cost-subscription-app-margins)). No published per-user distribution for a food-logging AI feature was found — the scenario set below is a transparent estimate:

| Scenario | Fills/month | COGS @ $0.014 (pool exhausted) |
|---|---|---|
| Median subscriber | 30 | $0.42 |
| Typical engaged | 80 | $1.12 |
| Heavy (5/day novel) | 150 | $2.10 |
| Very heavy (10/day) | 300 | $4.20 |
| Plausible-human ceiling (~20/day) | 600 | $8.40 |
| **Premium cap** | **1,000** | **$14.00** |
| **Anchor cap** | **10,000** | **$140.00** |

### 3.4 Premium candidates × usage → net margin per user per month

Net margin = net revenue/month (§3.2) − COGS (§3.3). Worst-case accounting: free pool already exhausted.

| Fills/mo | **$2.99/mo** (net $2.34) | **$3.99/mo** ($3.29) | **$4.99/mo** ($4.24) | **$19.99/yr** ($1.54) | **$24.99/yr** ($1.94) | **$29.99/yr** ($2.33) |
|---|---|---|---|---|---|---|
| 30 | +$1.92 | +$2.87 | +$3.82 | +$1.12 | +$1.52 | +$1.91 |
| 80 | +$1.22 | +$2.17 | +$3.12 | +$0.42 | +$0.82 | +$1.21 |
| 150 | +$0.24 | +$1.19 | +$2.14 | **−$0.56** | −$0.16 | +$0.23 |
| 300 | **−$1.86** | −$0.91 | +$0.04 | −$2.66 | −$2.26 | −$1.87 |
| 1,000 (cap) | −$11.66 | −$10.71 | −$9.76 | −$12.46 | −$12.06 | −$11.67 |
| **Break-even fills** | **167** | **235** | **303** | **110** | **138** | **167** |

Blended view (estimate): if the subscriber mean lands at 60–100 fills/month (power-law: median 30–40, fat tail), expected COGS is $0.84–1.40/user/month → blended margin ≈ $1.0–1.5 at $2.99/mo, $1.9–2.5 at $3.99/mo, $0.5–1.1 at $24.99/yr, $0.9–1.5 at $29.99/yr — and **$0.1–0.7 at $19.99/yr, i.e. one heavy month from underwater**. $19.99/yr only works if usage skews very low; treat it as the aggressive edge, not the default.

### 3.5 Anchor candidates × usage → margin, and the structural insight

Anchor priced off a $3.99/$29.99 Premium at the §2.6 multipliers (2.5×–4×):

| Fills/mo | **$9.99/mo** (net $8.99) | **$11.99/mo** ($10.89) | **$14.99/mo** ($13.74) | **$79.99/yr** ($6.29) | **$99.99/yr** ($7.87) |
|---|---|---|---|---|---|
| 300 | +$4.79 | +$6.69 | +$9.54 | +$2.09 | +$3.67 |
| 600 (human ceiling) | +$0.59 | +$2.49 | +$5.34 | **−$2.11** | −$0.53 |
| 1,000 | −$5.01 | −$3.11 | −$0.26 | −$7.71 | −$6.13 |
| 3,000 | −$33.01 | −$31.11 | −$28.26 | −$35.71 | −$34.13 |
| 10,000 (cap) | **−$131.01** | **−$129.11** | **−$126.26** | **−$133.71** | **−$132.13** |
| **Break-even fills** | **642** | **778** | **981** | **449** | **562** |

**The key structural insight, stated plainly:**

- **A maxed anchor subscriber is a loss at every plausible price.** Making the 10k cap break even requires **≈ $147.90/month** (solve 0.95P − 0.50 ≥ $140) or ≈ $1,769/year. No consumer price makes the cap economically safe.
- **Therefore the cap is not margin protection — it is abuse containment.** Its function is bounding the worst-case loss per subscriber-month at a known number (≈ $126–134 at these prices) instead of infinity. The *economic* protection is: (1) 10,000 fills/month ≈ 333/day — not achievable by a human logging food (the plausible-human ceiling is ~600/month, and even that assumes 20 novel foods daily, every day); (2) the per-user RPM limits and escalation ladder (client-advisory → server-metered) already designed in the [subscription note §4](subscription-gating.md). Anyone at the cap is scripted, which is an abuse problem with abuse tools, not a pricing problem.
- **Price the anchor for the human ceiling instead:** at 600 fills/month, $11.99/mo clears comfortably (+$2.49), $9.99/mo roughly breaks even (+$0.59), and annual anchors below ~$99.99/yr go underwater. **Floor for cap-safety in the human sense: ≈ $11.99/mo or ≈ $99.99/yr** (which also happen to sit at 3.0×/3.3× — inside the evidence-supported gap).

### 3.6 The free tier and the shared 5k pool

- The 5,000 free grounded prompts/month are **project-wide**, first-come-first-served across free *and* paid users. Full-burn arithmetic: **500 free users × 10 fills exhaust the pool alone**; at a more realistic 30–40% allowance burn (3–4 fills/user), ~1,300–1,650 free users do. Past that point every fill — including paid users' — bills from fill #1, which is what all tables above already assume.
- Worst-case free-user COGS once the pool is gone: 10 × $0.014 = **$0.14/user/month** — the 10-fill trial costs at most 14¢/user/month, cheap conversion spend by any standard (RevenueCat: hard-gated trials convert ~5× freemium, §2.3).
- The pool's total worth is 5,000 × $0.014 = **$70/month** — a fixed subsidy that matters at launch (covers ~500 active free users or ~50 median Premium users) and rounds to nothing at scale. Don't build pricing on it.

### 3.7 Caveats that move these numbers

1. **Queries-per-fill multiplier** (biggest lever): paid grounding bills per *search query*; if a macro-fill averages 1.5 queries, every COGS figure above rises 50% and every break-even drops by ⅓ (Premium $3.99/mo: 235 → 157 fills). **Measure this in the console during the first weeks and re-run this table before locking prices.**
2. **Tax-inclusive display** (§3.1) cuts UK/EU net a further ~17%.
3. **Refunds/chargebacks** not modeled; MoRs absorb processing but refunded months still burn any fills used.
4. Google can reprice grounding at any time; the free pool ("free, shared across Gemini 3") is presumably promotional and could shrink.

---

## 4. Candidate scenarios for #60 (evidence-backed options, NOT decisions)

All use annual-first display with monthly-equivalent framing, .99 endings, Premium highlighted as middle/best-value. Blended margin assumes the §3.4 estimate (subscriber mean 60–100 fills/month, pool exhausted).

| | **Scenario A — "Bottom of band"** | **Scenario B — "Sweet spot"** | **Scenario C — "Category median"** |
|---|---|---|---|
| Premium | $2.99/mo · **$24.99/yr** ($2.08/mo-equiv) | $3.99/mo · **$29.99/yr** ($2.50/mo-equiv) | $4.99/mo · **$39.99/yr** ($3.33/mo-equiv) |
| Anchor | $7.99/mo · $69.99/yr | $9.99/mo · $79.99/yr | $14.99/mo · $99.99/yr |
| Gap (monthly / annual) | 2.7× / 2.8× | 2.5× / 2.7× | 3.0× / 2.5× |
| Premium blended margin /user/mo | $0.5–1.1 (annual) · $1.0–1.5 (monthly) | $0.9–1.5 · $1.9–2.5 | $1.7–2.3 · $2.8–3.4 |
| Anchor at human ceiling (600 fills) | −$2.7 (annual $5.66 net/mo) · −$1.3 (monthly $7.09 net) | −$2.1 · +$0.6 | −$0.5 · +$5.3 |
| Fit with evidence | Max undercut vs MFP/MacroFactor; thinnest margins; anchor underwater for genuine heavy humans | Gap in the 2.5–3× cluster; $9.99/mo anchor = category's "normal" price (reads plausible, not fake); margins healthy | Prices at health&fitness median — abandons the "undercut" positioning from the subscription note §1.2; safest margins |
| Main risk | One measured 1.5× query multiplier or a VAT-inclusive market pushes Premium annual near zero | Anchor annual slightly underwater at the extreme-human tail (rare by construction) | Weakens "deliberately cheaper than the giants" story; $39.99/yr = Lose It! price with far fewer features |

**Directional read (for the grilling, not a decision):** Scenario B is the one the combined evidence points at — Premium $29.99/yr sits at the bottom of the category band ($20–44.99) per RevenueCat data, the monthly $3.99 door carries acceptable 17.5% fee drag, the $9.99/mo anchor is the most "normal-looking" expensive tier in consumer subscriptions, and the 2.5–2.7× gap is squarely in the observed consumer cluster. Scenario A is defensible only if early telemetry shows queries-per-fill ≈ 1.0 and usage skewing low; Scenario C trades positioning for safety.

---

## 5. Open questions for #60

1. **Pick the ladder:** Scenario A / B / C or a blend — and confirm the anchor multiplier (2.5× vs 3×) it implies.
2. **Cadence mechanics:** annual-first confirmed? Is monthly offered on *both* tiers or Premium only (anchor-annual-only would cap the worst fee drag *and* reduce anchor cannibalization risk)? Monthly-equivalent display copy in EN+ES.
3. **Fair-use disclosure:** where does the 10,000 number live — pricing-page footnote, ToS fair-use clause, or nowhere (accepting the §2.5 FTC/CMA-pattern risk)? This note recommends a findable footnote; #60 must decide the risk appetite.
4. **Currency & tax display:** USD-anchored with MoR auto-localization, or hand-set GBP/EUR/ARS price points? Tax-inclusive display in UK/EU (≈17% extra drag, §3.1) — absorb or regionalize prices?
5. **Telemetry gate:** commit prices now, or ship metering first and re-run §3 with measured queries-per-fill and a real usage distribution after 4–6 weeks of Premium beta? (The tables' single biggest unknown, §3.7.)
6. **Paddle vs Polar final call** (fees now equal at free tier; Polar Pro undercuts past ~$1.5–2k/mo — subscription note §2.4) — interacts with #60 only via the fee constants used here.
7. **Launch promotion:** founder/early-bird pricing (e.g. first-year discount) — and if so, anchored off which sticker?
8. **Renewal-risk mitigation for annual:** given ⅓ of annual subscribers cancel auto-renew in month 1 (§2.3), do we add a pre-renewal email (MoR-provided or ours)?
9. **Paywall copy tone for the anchor:** abundance framing that stays on the right side of §2.5 — sign-off on final EN+ES strings ("more fills than you'll ever log" vs a stated 10,000).

---

## Sources

**Primary — papers:**
- Huber, Payne & Puto (1982), Adding Asymmetrically Dominated Alternatives, *JCR* 9(1):90–98 — [doi:10.1086/208899](https://doi.org/10.1086/208899)
- Simonson (1989), Choice Based on Reasons: Attraction and Compromise Effects, *JCR* 16(2):158–174 — [doi:10.1086/209205](https://doi.org/10.1086/209205)
- Tversky & Kahneman (1974), Judgment under Uncertainty, *Science* 185:1124–1131 — [doi:10.1126/science.185.4157.1124](https://doi.org/10.1126/science.185.4157.1124)
- Frederick, Lee & Baskin (2014), The Limits of Attraction, *JMR* 51(4):487–507 — [doi:10.1509/jmr.12.0061](https://journals.sagepub.com/doi/abs/10.1509/jmr.12.0061)
- Yang & Lynn (2014), More Evidence Challenging the Robustness and Usefulness of the Attraction Effect, *JMR* — [doi:10.1509/jmr.14.0020](https://journals.sagepub.com/doi/10.1509/jmr.14.0020)
- Huber, Payne & Puto (2014), Let's Be Honest About the Attraction Effect, *JMR* 51(4):520–525 — [doi:10.1509/jmr.14.0208](https://journals.sagepub.com/doi/10.1509/jmr.14.0208) · [PDF](https://people.duke.edu/~jch8/bio/Papers/HuberPaynePutoJMR%202014.pdf)
- Rodway, Schepman & Lambert (2012), Preferring the One in the Middle, *Appl. Cognit. Psychol.* 26(2):215–222 — [doi:10.1002/acp.1812](https://onlinelibrary.wiley.com/doi/abs/10.1002/acp.1812)
- Anderson & Simester (2003), Effects of $9 Price Endings on Retail Sales, *QME* 1:93–110 — [doi:10.1023/A:1023581927405](https://link.springer.com/article/10.1023/A:1023581927405)
- Iyengar & Lepper (2000), When Choice is Demotivating, *JPSP* 79(6):995–1006 — [doi:10.1037/0022-3514.79.6.995](https://doi.org/10.1037/0022-3514.79.6.995); Scheibehenne, Greifeneder & Todd (2010) meta-analysis — [doi:10.1086/651235](https://doi.org/10.1086/651235)
- Klein et al. (2014), Many Labs Replication Project, *Social Psychology* 45(3):142–152 — [doi:10.1027/1864-9335/a000178](https://doi.org/10.1027/1864-9335/a000178)
- Ariely, *Predictably Irrational* (2008), ch. 1 (Economist experiment; book — [chapter summary](https://whistlinginthewind.org/2013/01/11/predictably-irrational-chapter-1-the-truth-about-relativity/))

**Primary — pricing pages & official docs (fetched 2026-07-17):**
- [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing) (grounding $14/1k, 5k/mo free, Flash-Lite tokens) · [Gemini API grounding](https://ai.google.dev/gemini-api/docs/google-search) · [Firebase AI Logic pricing](https://firebase.google.com/docs/ai-logic/pricing)
- [ChatGPT pricing](https://chatgpt.com/pricing/) · [OpenAI Help — Pro tiers](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers) · [MyFitnessPal premium](https://www.myfitnesspal.com/premium) · [MFP membership tiers blog](https://blog.myfitnesspal.com/myfitnesspal-membership-pricing-tiers/) · [Whoop membership](https://www.whoop.com/us/en/membership/)
- [FTC — AT&T Mobility case](https://www.ftc.gov/legal-library/browse/cases-proceedings/122-3253-att-mobility-llc-mobile-data-service) · [FTC — AT&T refunds (2024)](https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-sends-refunds-former-att-wireless-customers-who-were-subject-data-throttling) · [FTC — Bringing Dark Patterns to Light](https://www.ftc.gov/reports/bringing-dark-patterns-light) · [CMA — Online Choice Architecture (CMA155)](https://www.gov.uk/government/publications/online-choice-architecture-how-digital-design-can-harm-competition-and-consumers)

**Primary — industry datasets:**
- [RevenueCat — State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps) · [10-minute summary](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026/) · [RevenueCat — hidden cost of AI features](https://www.revenuecat.com/blog/growth/ai-feature-cost-subscription-app-margins)
- [Adapty — paywall experiments playbook (15k-app dataset)](https://adapty.io/blog/paywall-experiments-playbook/) · [Paddle — app CRO playbook](https://www.paddle.com/blog/app-cro-playbook-for-2025)

**Secondary (pointers only, never sole support):**
- [Airbridge — subscription pricing by category (RevenueCat data)](https://www.airbridge.io/en/blog/subscription-app-pricing-by-category-2026-benchmark) · [digitalapplied — pricing-page psychology (Price Intelligently 3-vs-2-tier claim, unverified)](https://www.digitalapplied.com/blog/subscription-pricing-page-psychology-decision-framework-2026) · [getmonetizely — $99 vs $100 (ProfitWell charm-pricing claims)](https://www.getmonetizely.com/articles/the-power-of-rounding-why-99-vs-100-matters-in-saas-pricing-strategy) · [softwarepricing.com — credit-based AI pricing flaws](https://softwarepricing.com/blog/credit-based-pricing-ai/) · [Freemius — AI app pricing models](https://freemius.com/blog/ai-app-pricing-model/) · [languageappguide — Duolingo pricing 2026](https://languageappguide.com/pricing/duolingo-cost/) · [Duolingo Max review](https://copycatcafe.com/blog/duolingo-max)

**Prior repo research this note builds on:** [gemini-firebase-ai-logic-macro-fill.md](gemini-firebase-ai-logic-macro-fill.md) (grounding mechanics & cost, 2026-07-10) · subscription-gating note (MoR shortlist & fees, competitor price table, enforcement ladder — researched 2026-07-17, pending merge to `docs/research/`).

# Gemini + Firebase AI Logic for AI Macro-Fill — Research Note

_Scope: feeds a design decision for Yaffle V2's "AI macro-fill" (short free-text food description → calories/macros, four-tier confidence contract), using the client-side Firebase AI Logic Web/JS SDK with Google Search grounding. Researched 2026-07-10 against Firebase / Gemini API primary docs. All dates/prices/model names verified against current docs on that date and may drift._

---

## TL;DR / Recommendations

- **Q1 — Grounding + structured output in one request:** The Firebase AI Logic Web SDK **does** support Google Search grounding (`tools: [{ googleSearch: {} }]`). Combining grounding with `responseSchema` (structured JSON) **in the same request is officially supported only on Gemini 3-series models** — it's a documented preview feature scoped to "Gemini 3 series". On **Gemini 2.5 models this combination is not supported**, so a 2.5 pick forces a workaround (two-step, or prompt-instructed JSON). **Decision driver: pick a Gemini 3 model so you can do it in one call.**
- **Q2 — Latency:** No published grounding-latency SLA number exists in the primary docs (verified — none found). By mechanism, grounding performs a live web search round-trip *before/within* generation, and Flash-class models are "thinking" models by default. **Sub-second "instant fill" is not reliable; expect roughly 1–4 s.** Design a visible "thinking"/loading state and stream if possible. (This is reasoned inference, clearly flagged — not a cited number.)
- **Q3 — Cost:** Grounding fee (Gemini Developer API): **Gemini 3 models = 5,000 prompts/month free, then $14 / 1,000 search queries**; **Gemini 2.5 models = 1,500 requests/day free (shared with Flash RPD), then $35 / 1,000 grounded prompts**. Token cost is tiny for this task (short in/out). Firebase AI Logic itself is free; **the Gemini Developer API works on the free Spark plan (no billing account)**, but production volume / advanced use needs **Blaze**. The Vertex AI provider **requires Blaze**. **Budget alerts are advised but do not cap spend** — combine with App Check + Auth + rate limits.
- **Q4 — Abuse protection:** Firebase AI Logic **supports and strongly recommends App Check** (proxy gateway verifies App Check before forwarding to Gemini). It's described as "critical", and **as of early July 2026 App Check is auto-enforced for new AI Logic setups**; older projects must enforce it manually. **Enforce App Check.** Separately, **require Firebase Auth sign-in before the macro-fill button** and add per-user rate limiting — App Check stops non-app clients, not a logged-in user hammering the button.
- **Q5 — Model pick:** Current GA lineup includes **Gemini 3.5 Flash**, **3.1 Flash-Lite**, **2.5 Pro/Flash/Flash-Lite** (3.1 Pro is preview). **Recommend Gemini 3.1 Flash-Lite as the default**: it's a Gemini-3 model (so grounding + structured output works in one request), GA, lowest-latency, cheapest Gemini-3 tokens, and its grounding fee ($14/1k) is *lower* than 2.5's ($35/1k). Escalate to **3.5 Flash** only if answer quality is insufficient. Avoid 2.5 (forces the two-step workaround) and Pro (overkill/preview).

---

## Q1 — Grounding + Structured Output

**Grounding is supported in the Web SDK.** The Firebase AI Logic grounding doc shows the Web/JS SDK enabling it as a tool on the model instance:

```js
const model = getGenerativeModel(ai, {
  model: "GEMINI_MODEL_NAME",
  tools: [{ googleSearch: {} }],
});
```

Providing the tool doesn't force the model to search; ungrounded responses omit `groundingMetadata`. ([Firebase AI Logic — Grounding with Google Search](https://firebase.google.com/docs/ai-logic/grounding-google-search))

**Combining grounding with structured output is a Gemini-3-only feature.** The Gemini API structured-output doc states verbatim:

> "Gemini 3 lets you combine Structured Outputs with built-in tools, including Grounding with Google Search, URL Context, Code Execution, File Search, and Function Calling."
>
> "Preview: This feature is available only to Gemini 3 series models."

([Gemini API — Structured output](https://ai.google.dev/gemini-api/docs/structured-output); same statement appears on the [generate-content structured-output page](https://ai.google.dev/gemini-api/docs/generate-content/structured-output))

**What this means:**
- On a **Gemini 3 model** (e.g. `gemini-3.1-flash-lite`, `gemini-3.5-flash`), you can send **one request** with both `tools: [{ googleSearch: {} }]` **and** `responseMimeType: "application/json"` + `responseSchema`. This is the clean path and the basis of the schema recommendation below.
- On a **Gemini 2.5 model**, this combination is **not part of the supported feature set** — the docs scope it to Gemini 3 series only. Treat grounding + `responseSchema` in one 2.5 request as unsupported.

> **Honesty note:** I could not find a primary page that says in so many words "Gemini 2.5 returns an error if you set tools and responseSchema together." What I can cite is the affirmative statement that the *combined* capability is a Gemini-3-series-only preview. The safe reading — and the design assumption I'm making — is: if you want one-request grounded structured output, use a Gemini 3 model.

**If you were forced onto Gemini 2.5, the workarounds (ranked):**
1. **Just use a Gemini 3 model** (recommended — removes the problem entirely).
2. **Two-step:** grounded call returns free text with facts → a second *ungrounded* call with `responseSchema` structures it into the four-tier JSON. Doubles latency and roughly doubles token cost; grounding fee charged once.
3. **Prompt-instructed JSON (no `responseSchema`):** single grounded call, instruct the model to emit the JSON contract in its text, then parse defensively. One request, but no schema guarantee — you must validate and handle malformed output.
4. **Function calling:** define one `fill_macros` function. On Gemini 3 this can be combined with grounding; on 2.5 it's a tool and hits the same combination limit — no advantage over option 2/3.

**Two caveats regardless of model:**
- **Grounding display compliance.** If a response is "grounded" (contains `searchEntryPoint` in `groundingMetadata`), you are required to display Google Search Suggestions per the grounding usage requirements. A silent numeric autofill that hides these may violate the terms — factor this into the UX. ([Firebase AI Logic — Grounding with Google Search](https://firebase.google.com/docs/ai-logic/grounding-google-search))
- **Firebase SDK support lag.** The combined feature is a recent Gemini-3 capability. Confirm the Firebase AI Logic Web SDK version you pin actually forwards `responseSchema` + `googleSearch` together on a Gemini 3 model — run a 30-minute spike before committing the design. (Flagged as a verification item; not something I could confirm end-to-end from docs.)

---

## Q2 — Latency

**No primary-source latency number for grounded calls was found.** I checked the Gemini 2.5 Flash / Flash-Lite model pages and pricing/grounding docs; they describe models as "low-latency" but publish **no grounding round-trip latency figure or SLA** for a grounded generate call. ([Gemini 2.5 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash), [Gemini 2.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite))

**Reasoning from how grounding works (inference, not a cited number):**
- The documented grounding workflow is: your prompt → model decides to search → model issues **one or more** Google Search queries → results returned → model generates the answer. That's a serial web round-trip added on top of generation. ([Gemini API — Grounding](https://ai.google.dev/gemini-api/docs/google-search))
- Flash-class 2.5/3.x models are **"thinking" models**, adding reasoning latency by default (2.5 Flash is described as "tasks that require thinking"). ([Gemini 2.5 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash))

**Conclusion:** Treat a grounded Flash-class call for a short prompt as **~1–4 s, occasionally more** (multiple search queries compound it). Sub-second "instant fill" is **not reliable**. Design for it:
- Show a visible "thinking" / skeleton state on the macro fields.
- Stream the response if the SDK path allows, so fields populate progressively.
- Consider lowering the thinking budget and preferring **Flash-Lite** (positioned for "extremely low-latency applications"). ([Gemini 2.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite))
- Consider making grounding **conditional** (common foods rarely need a web search) to cut latency and cost for the majority case.

---

## Q3 — Cost

**Grounding fee (Gemini Developer API)** — quoted from the pricing page:
- **Gemini 3 models:** "5,000 prompts per month (free, shared across Gemini 3), then **$14 / 1,000 search queries**". Billed **per search query the model executes** (a single prompt can trigger multiple billable queries). Retrieved grounding context is **not** charged as input tokens.
- **Gemini 2.5 models:** "1,500 RPD (free, limit shared with Flash RPD), then **$35 / 1,000 grounded prompts**". Billed **per prompt**.

([Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing); billing-model split confirmed on [Gemini API — Grounding](https://ai.google.dev/gemini-api/docs/google-search))

> Note on the free grounding allotment: the pricing page presents the numbers above; the exact tier at which the free grounding quota applies (free vs paid tier) is worth confirming in-console for your project, as the tables split free/paid tiers and the wording is terse.

**Token prices (paid tier, per 1M tokens, Gemini Developer API):**

| Model | Input | Output |
|---|---|---|
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 |
| Gemini 2.5 Flash | $0.30 | $2.50 |
| Gemini 3.1 Flash-Lite | $0.25 | $1.50 |
| Gemini 3.5 Flash | $1.50 | $9.00 |
| Gemini 2.5 Pro | $1.25 (≤200k) / $2.50 | $10.00 (≤200k) / $15.00 |
| Gemini 3.1 Pro (preview) | $2.00 (≤200k) / $4.00 | $12.00 (≤200k) / $18.00 |

([Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing))

**Per-call reality for macro-fill.** The prompt and JSON answer are tiny (order ~400 in / ~200 out tokens), so **the grounding fee dominates**, not tokens. Rough per-call cost *past the free quota*:
- **Gemini 3.1 Flash-Lite:** ~$0.014 grounding + ~$0.0004 tokens ≈ **$0.014/call**.
- **Gemini 3.5 Flash:** ~$0.014 grounding + ~$0.0024 tokens ≈ **$0.016/call**.
- **Gemini 2.5 Flash:** ~$0.035 grounding + ~$0.0006 tokens ≈ **$0.036/call**.

So a Gemini-3 model is **~2.5× cheaper per grounded call** than 2.5 here, purely because of the lower grounding fee — reinforcing the model pick.

**Provider & Firebase plan requirements:**
- Firebase AI Logic itself is free to use. Cost comes from the chosen Gemini API provider. ([Firebase AI Logic pricing](https://firebase.google.com/docs/ai-logic/pricing))
- **Gemini Developer API:** has a **free tier that works on the Spark plan** and doesn't require linking a Cloud Billing account. Higher volume / advanced features need **Blaze (pay-as-you-go)**.
- **Vertex AI Gemini API:** **requires the Blaze plan.**
- **Budgets:** setting up **budget alerts is advised** on Blaze, but the docs are explicit that "budget alerts do *not* cap your usage or charges — they are *alerts*." So budgets alone are not abuse protection. ([Firebase AI Logic pricing](https://firebase.google.com/docs/ai-logic/pricing))

**Recommendation:** Start on the **Gemini Developer API**. Prototype on Spark free tier; move to **Blaze** for production grounding volume. Set a budget alert **and** enforce App Check + require Auth + apply per-user rate limiting (see Q4).

---

## Q4 — Abuse Protection

**App Check is supported and strongly recommended.** Firebase AI Logic routes SDK requests through a **proxy gateway** that performs App Check verification *before* forwarding to the Gemini backend, so the client never holds a usable Gemini key and unauthorized clients are rejected. The doc calls enforcement **"critical … as early as possible"**, and:

> "Starting early July 2026, Firebase automatically enforces App Check for AI Logic during the guided setup workflow in the Firebase console." Projects set up before that date "must enforce App Check yourself."

([Firebase AI Logic — Implement App Check](https://firebase.google.com/docs/ai-logic/app-check)) For web, the recommended attestation provider is reCAPTCHA Enterprise. ([Firebase App Check — web / reCAPTCHA Enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider); [Enable enforcement](https://firebase.google.com/docs/app-check/enable-enforcement))

**Action: enforce App Check on the AI Logic product before any public deploy.**

**Require sign-in for the macro-fill button (recommended design, not a cited mandate).** App Check answers "is this a genuine instance of *my app*?" — it does **not** stop a legitimate signed-in (or even anonymous-app) user from spamming the button to burn your grounding budget. To bound cost abuse:
- Gate the AI macro-fill behind **Firebase Auth sign-in** so every call is attributable to a user.
- Add **per-user rate limiting / daily quota** (e.g. tracked in Firestore or a Cloud Function) on top of App Check.
- Keep the **budget alert** as a backstop (it warns, doesn't cap).

Together: App Check (blocks non-app clients) + Auth (attributes usage) + per-user limits (caps a single user) + budget alert (whole-account warning).

---

## Q5 — Model Pick

**Current lineup (Firebase AI Logic, as of 2026-07-10):**

| Model | ID | Status | Grounding | Structured output | Grounding + structured in one call? |
|---|---|---|---|---|---|
| Gemini 3.5 Flash | `gemini-3.5-flash` | GA (2026-05-19) | Yes | Yes | **Yes (Gemini 3)** |
| Gemini 3.1 Flash-Lite | `gemini-3.1-flash-lite` | GA (2026-05-07) | Yes | Yes | **Yes (Gemini 3)** |
| Gemini 3.1 Pro | `gemini-3.1-pro-preview` | Preview (billing req.) | Yes | Yes | Yes (Gemini 3) |
| Gemini 2.5 Pro | `gemini-2.5-pro` | GA | Yes | Yes | No |
| Gemini 2.5 Flash | `gemini-2.5-flash` | GA | Yes | Yes | No |
| Gemini 2.5 Flash-Lite | `gemini-2.5-flash-lite` | GA | Yes | Yes | No |

([Firebase AI Logic — Supported models](https://firebase.google.com/docs/ai-logic/models); [Firebase AI Logic — Grounding](https://firebase.google.com/docs/ai-logic/grounding-google-search))

**Trade-offs for this task (short food description → macros):**
- **2.5 Flash-Lite** — cheapest tokens, lowest latency, GA — **but** it's a 2.5 model, so grounding + `responseSchema` can't be combined in one request → forces the two-step workaround **and** pays the higher $35/1k grounding fee. Net: cheaper tokens, worse overall for this use case.
- **3.1 Flash-Lite** — GA, "most cost-efficient / fastest" Gemini-3 model, cheapest Gemini-3 tokens ($0.25/$1.50), $14/1k grounding, and **supports grounding + structured output in one call**. Parsing a short food string is well within its capability.
- **3.5 Flash** — more capable, GA, but ~6× the output-token price of 3.1 Flash-Lite; unnecessary for such a small task unless quality proves lacking.
- **Pro (2.5 or 3.1)** — overkill for a one-line parse; 3.1 Pro is preview and billing-gated.

**Recommendation: default to `gemini-3.1-flash-lite`.** It uniquely combines everything this feature needs — one-request grounded structured output (Gemini-3 capability), lowest latency, lowest Gemini-3 token and grounding cost, and GA stability. Keep `gemini-3.5-flash` as a **quality-escalation fallback** if Flash-Lite's macro estimates or clarifying-question judgement disappoint in testing.

> Verify in the spike: the combined "structured outputs with tools" preview is documented as "Gemini 3 series". `gemini-3.1-flash-lite` is a Gemini-3 model, and the models table lists it as supporting both grounding and structured output, so it should qualify — but the doc's worked example used `gemini-3.1-pro-preview`, so confirm Flash-Lite specifically before relying on it.

---

## Recommended Request / Response Schema

**Chosen approach:** single request on **Gemini 3.1 Flash-Lite** with `tools: [{ googleSearch: {} }]` **and** `responseMimeType: "application/json"` + `responseSchema` (Gemini-3 combined feature). No two-step workaround needed.

**Schema-shape constraint to respect:** Gemini's controlled-generation schema is an OpenAPI *subset* — `oneOf` / discriminated unions and several keywords are **not** supported, deeply nested schemas may be rejected, and **Firebase AI Logic treats every field as required unless named in `optionalProperties`**. ([Vertex — controlled generation notes](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output); [Firebase AI Logic — structured output](https://firebase.google.com/docs/ai-logic/generate-structured-output)). **So model the four tiers as one flat object with a `status` enum + optional payload fields**, not as a `oneOf` union.

### App-side TypeScript type (clean discriminated union for your code)

```ts
type MacroFillResult =
  | { status: "confident"; food: Food }
  | { status: "unsure"; food: Food; uncertainFields: MacroField[] }
  | { status: "ambiguous"; question: string }   // exactly ONE question
  | { status: "hopeless"; hint: string };

interface Food {
  label: string;        // normalized name, e.g. "Butter, salted"
  servingText: string;  // how the input was interpreted, e.g. "10 g"
  grams: number | null; // resolved mass, null if not mass-based
  calories: number;     // kcal
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}
type MacroField = "servingText" | "grams" | "calories" | "protein_g" | "carbs_g" | "fat_g";
```

### Wire `responseSchema` (flat; `status` required, everything else optional)

```jsonc
{
  "type": "object",
  "properties": {
    "status": { "type": "string", "enum": ["confident", "unsure", "ambiguous", "hopeless"] },
    "food": {
      "type": "object",
      "description": "Fill when status is 'confident' or 'unsure'.",
      "properties": {
        "label":       { "type": "string" },
        "servingText": { "type": "string" },
        "grams":       { "type": "number", "nullable": true },
        "calories":    { "type": "number" },
        "protein_g":   { "type": "number" },
        "carbs_g":     { "type": "number" },
        "fat_g":       { "type": "number" }
      },
      "optionalProperties": ["grams"]
    },
    "uncertainFields": {
      "type": "array",
      "description": "Fill ONLY when status is 'unsure': names of low-confidence fields.",
      "items": { "type": "string",
        "enum": ["servingText", "grams", "calories", "protein_g", "carbs_g", "fat_g"] }
    },
    "question": { "type": "string", "description": "Fill ONLY when status is 'ambiguous': exactly one clarifying question." },
    "hint":     { "type": "string", "description": "Fill ONLY when status is 'hopeless': one short hint." }
  },
  "required": ["status"],
  "optionalProperties": ["food", "uncertainFields", "question", "hint"]
}
```

Enforce the tier rules (which fields belong to which `status`) in the **prompt** and **validate on the client**, since the flat schema can't express them structurally. `optionalProperties` is Firebase AI Logic's mechanism for non-required fields.

### Worked examples (one per tier)

**1. Confident — `"10g butter"`**
```json
{
  "status": "confident",
  "food": { "label": "Butter, salted", "servingText": "10 g", "grams": 10,
            "calories": 72, "protein_g": 0.1, "carbs_g": 0.0, "fat_g": 8.1 }
}
```

**2. Mildly unsure — `"medium banana"`** (macros known; portion size estimated)
```json
{
  "status": "unsure",
  "food": { "label": "Banana, raw", "servingText": "1 medium (~118 g)", "grams": 118,
            "calories": 105, "protein_g": 1.3, "carbs_g": 27.0, "fat_g": 0.4 },
  "uncertainFields": ["grams", "calories"]
}
```

**3. Ambiguous — `"bowl of cereal"`** (blocker: which cereal — macros vary hugely)
```json
{
  "status": "ambiguous",
  "question": "Which cereal is it (brand or type), and roughly how much — e.g. a 40 g / 1-cup serving?"
}
```
_(Prompt instruction: return exactly one question, targeting the single most blocking unknown.)_

**4. Hopeless — `"my grandma's secret stew"`**
```json
{
  "status": "hopeless",
  "hint": "Tell me the main ingredients and rough amounts, e.g. \"200 g beef, 1 potato, 100 ml cream\"."
}
```

---

## Sources (primary)

- Firebase AI Logic — Grounding with Google Search: https://firebase.google.com/docs/ai-logic/grounding-google-search
- Firebase AI Logic — Implement App Check: https://firebase.google.com/docs/ai-logic/app-check
- Firebase App Check — Enable enforcement: https://firebase.google.com/docs/app-check/enable-enforcement
- Firebase App Check — web / reCAPTCHA Enterprise provider: https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- Firebase AI Logic — Pricing / plan requirements: https://firebase.google.com/docs/ai-logic/pricing
- Firebase AI Logic — Supported models: https://firebase.google.com/docs/ai-logic/models
- Firebase AI Logic — Generate structured output: https://firebase.google.com/docs/ai-logic/generate-structured-output
- Gemini API — Structured output (structured outputs with tools = Gemini 3 only): https://ai.google.dev/gemini-api/docs/structured-output
- Gemini API — Structured output (generate-content surface): https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- Gemini API — Grounding with Google Search (billing per-query vs per-prompt): https://ai.google.dev/gemini-api/docs/google-search
- Gemini Developer API — Pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini API — Model: 2.5 Flash: https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash
- Gemini API — Model: 2.5 Flash-Lite: https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite
- Vertex / Gemini Enterprise — Controlled generated output (schema subset limits): https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output

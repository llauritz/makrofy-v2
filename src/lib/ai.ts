import type { AiFailureReport } from "../../functions/src/ai-failure"
import { describeAiError, describeBadOutput } from "./ai-report"
import { app } from "./firebase"
import { callable } from "./functions"
import {
  parseMacroFillResponse,
  SYSTEM_PROMPT,
  type MacroFillResult,
} from "./macro-fill"

// The Gemini client behind AI macro-fill (spec § AI macro-fill, #21), on the
// stack the #20 spike validated: a Gemini-3 model on the Vertex AI backend's
// `global` endpoint (us-central1 404s for these models), Google Search
// grounding and the four-tier responseSchema together in ONE request (the
// Gemini-3 combined capability), behind App Check (AI Logic is the one
// auto-enforced product). Everything is loaded lazily on the first ✨ tap —
// most sessions never pay for the AI SDK or the reCAPTCHA script.

// 3.5 Flash-Lite at LOW thinking: a food lookup needs no deep reasoning, and
// thinking time sits directly in the user's wait (model swap 2026-11-01;
// timed against 3.1 Flash-Lite with the dev bench at /ai-bench.html).
export const MODEL_ID = "gemini-3.5-flash-lite"
export const THINKING_LEVEL: AiModelConfig["thinkingLevel"] = "LOW"

/** The knobs the dev bench varies; production uses the constants above. */
export interface AiModelConfig {
  model: string
  /** null leaves the model's default dynamic thinking in place. */
  thinkingLevel: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH" | null
}

// The reCAPTCHA Enterprise site key for production App Check attestation —
// public by design (it ships in the bundle, like firebaseConfig). Local dev
// doesn't use it: the `local-dev` debug token in .env.local takes over below.
const RECAPTCHA_ENTERPRISE_SITE_KEY = "6LcoOE4tAAAAAOWYJ_eLVGQjIRCqlgP0dHeM9az-"

/** One model answer: the validated four-tier result plus its display duty. */
export interface AiFillReply {
  result: MacroFillResult
  /**
   * Google Search Suggestions HTML (groundingMetadata.searchEntryPoint) —
   * present exactly when the model searched, and REQUIRED to be displayed at
   * response time then (Google's grounding terms — compliance, not style).
   * Null on ungrounded answers: staples resolve silently.
   */
  attribution: string | null
}

type Model = import("firebase/ai").GenerativeModel

let modelPromise: Promise<Model> | null = null

function ensureModel(): Promise<Model> {
  modelPromise ??= createModel({
    model: MODEL_ID,
    thinkingLevel: THINKING_LEVEL,
  })
  return modelPromise
}

let sdkPromise: Promise<{
  ai: import("firebase/ai").AI
  aiSdk: typeof import("firebase/ai")
}> | null = null

/** App Check + the AI Logic instance, initialised once per page. */
function ensureSdk() {
  sdkPromise ??= initSdk()
  return sdkPromise
}

async function initSdk() {
  const [appCheck, aiSdk] = await Promise.all([
    import("firebase/app-check"),
    import("firebase/ai"),
  ])

  // App Check must be live before the first AI call (#20 finding). In dev the
  // registered `local-dev` debug token (git-ignored .env.local) short-circuits
  // attestation — the SDK reads this global during init.
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
  if (import.meta.env.DEV && debugToken) {
    ;(
      self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }
    ).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken
  }
  appCheck.initializeAppCheck(app, {
    provider: new appCheck.ReCaptchaEnterpriseProvider(
      RECAPTCHA_ENTERPRISE_SITE_KEY
    ),
    isTokenAutoRefreshEnabled: true,
  })

  const ai = aiSdk.getAI(app, { backend: new aiSdk.VertexAIBackend("global") })
  return { ai, aiSdk }
}

/**
 * The production request shape for a given model config. Exported for the
 * dev bench (src/dev/ai-bench.ts) so it times exactly what users get.
 */
export async function createModel(config: AiModelConfig): Promise<Model> {
  const { ai, aiSdk } = await ensureSdk()
  return aiSdk.getGenerativeModel(ai, {
    model: config.model,
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ googleSearch: {} }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: buildResponseSchema(aiSdk.Schema),
      ...(config.thinkingLevel && {
        thinkingConfig: { thinkingLevel: config.thinkingLevel },
      }),
    },
  })
}

// The four-tier wire schema (docs/research/gemini-firebase-ai-logic-macro-fill.md
// § Recommended Schema, verified on the wire by #20), plus answerChips for the
// ambiguous tier's quick-tap answers (#5's contract; the tier rules that bind
// fields to statuses live in SYSTEM_PROMPT — this shape can't express them).
function buildResponseSchema(Schema: typeof import("firebase/ai").Schema) {
  return Schema.object({
    properties: {
      status: Schema.enumString({
        enum: ["confident", "unsure", "ambiguous", "hopeless"],
      }),
      food: Schema.object({
        description: "Fill when status is 'confident' or 'unsure'.",
        properties: {
          label: Schema.string(),
          servingText: Schema.string(),
          grams: Schema.number({ nullable: true }),
          calories: Schema.number(),
          protein_g: Schema.number(),
          carbs_g: Schema.number(),
          fat_g: Schema.number(),
        },
        optionalProperties: ["grams"],
      }),
      uncertainFields: Schema.array({
        description:
          "Fill ONLY when status is 'unsure': names of low-confidence fields.",
        items: Schema.enumString({
          enum: [
            "servingText",
            "grams",
            "calories",
            "protein_g",
            "carbs_g",
            "fat_g",
          ],
        }),
      }),
      question: Schema.string({
        description:
          "Fill ONLY when status is 'ambiguous': exactly one clarifying question.",
      }),
      // Deliberately NOT optional: flash-lite reliably omits optional fields
      // it is merely instructed to fill (verified live — grounded ambiguous
      // answers came back chipless despite prompt + few-shot), and required
      // properties are enforced by the schema decoder. Non-ambiguous tiers
      // return it empty.
      answerChips: Schema.array({
        description:
          "When status is 'ambiguous': 2-4 short tap-to-answer options, each a complete answer to the question. Empty array on every other status.",
        items: Schema.string(),
      }),
      hint: Schema.string({
        description: "Fill ONLY when status is 'hopeless': one short hint.",
      }),
    },
    optionalProperties: ["food", "uncertainFields", "question", "hint"],
  })
}

/**
 * One round trip: send the description (or a followUpPrompt) and validate the
 * answer against the four-tier contract. Returns null when the model replied
 * but not in contract shape — callers treat that like a failed call. Network
 * and service errors (offline, 401 without App Check, quota) propagate as
 * exceptions. Either way the failure is reported for monitoring (ADR 0014);
 * `final` marks the answer to a clarifying question.
 */
export async function fillMacros(
  prompt: string,
  final = false
): Promise<AiFillReply | null> {
  const started = performance.now()
  const ctx = () => ({
    model: MODEL_ID,
    ms: performance.now() - started,
    final,
  })
  let response: import("firebase/ai").EnhancedGenerateContentResponse
  let text: string
  try {
    const model = await ensureModel()
    response = (await model.generateContent(prompt)).response
    text = response.text()
  } catch (err) {
    reportAiFailure(describeAiError(err, ctx()))
    throw err
  }
  const candidate = response.candidates?.[0]
  const result = parseMacroFillResponse(text)
  if (!result) {
    reportAiFailure(
      describeBadOutput(candidate?.finishReason ?? null, text.length, ctx())
    )
    return null
  }
  const entryPoint =
    candidate?.groundingMetadata?.searchEntryPoint?.renderedContent
  return { result, attribution: entryPoint || null }
}

// A burst of failures (say, Google down for an afternoon) shouldn't turn one
// phone into a flood of reports; a handful per page load tells us enough.
const MAX_REPORTS_PER_PAGE = 10
let sent = 0

/** Fire and forget: reporting must never slow down or break the fill. */
function reportAiFailure(report: AiFailureReport): void {
  if (sent >= MAX_REPORTS_PER_PAGE) return
  sent++
  callable("reportAiFailure", report).catch(() => {
    // Nowhere left to report to; the user already sees the fill's own error.
  })
}

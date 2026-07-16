import { app } from "./firebase"
import {
  parseMacroFillResponse,
  SYSTEM_PROMPT,
  type MacroFillResult,
} from "./macro-fill"

// The Gemini client behind AI macro-fill (spec § AI macro-fill, #21), exactly
// as the #20 spike validated it: `gemini-3.1-flash-lite` on the Vertex AI
// backend's `global` endpoint (us-central1 404s for this model), Google
// Search grounding and the four-tier responseSchema together in ONE request
// (the Gemini-3 combined capability), behind App Check (AI Logic is the one
// auto-enforced product). Everything is loaded lazily on the first ✨ tap —
// most sessions never pay for the AI SDK or the reCAPTCHA script.

const MODEL_ID = "gemini-3.1-flash-lite"

// The reCAPTCHA Enterprise site key for production App Check attestation.
// Public by design (it ships in the bundle, like firebaseConfig above it in
// firebase.ts) — but its value was never recorded in #12's resolution, so it
// must be pasted here from the Firebase console (App Check → yaffle-web)
// before the AI path works on goyaffle.web.app. Local dev doesn't need it:
// the `local-dev` debug token in .env.local takes over below.
const RECAPTCHA_ENTERPRISE_SITE_KEY = "RECAPTCHA_SITE_KEY_PENDING"

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
  modelPromise ??= createModel()
  return modelPromise
}

async function createModel(): Promise<Model> {
  const [appCheck, aiSdk] = await Promise.all([
    import("firebase/app-check"),
    import("firebase/ai"),
  ])

  // App Check must be live before the first AI call (#20 finding). In dev the
  // registered `local-dev` debug token (git-ignored .env.local) short-circuits
  // attestation — the SDK reads this global during init.
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
  if (import.meta.env.DEV && debugToken) {
    ;(self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debugToken
  }
  appCheck.initializeAppCheck(app, {
    provider: new appCheck.ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  })

  const ai = aiSdk.getAI(app, { backend: new aiSdk.VertexAIBackend("global") })
  return aiSdk.getGenerativeModel(ai, {
    model: MODEL_ID,
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ googleSearch: {} }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: buildResponseSchema(aiSdk.Schema),
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
          enum: ["servingText", "grams", "calories", "protein_g", "carbs_g", "fat_g"],
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
 * exceptions.
 */
export async function fillMacros(prompt: string): Promise<AiFillReply | null> {
  const model = await ensureModel()
  const { response } = await model.generateContent(prompt)
  const result = parseMacroFillResponse(response.text())
  if (!result) return null
  const entryPoint =
    response.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent
  return { result, attribution: entryPoint || null }
}

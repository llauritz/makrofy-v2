// The dev bench's own Gemini client (src/dev/ai-bench.ts): Firebase AI Logic
// straight from the browser, the way production called Gemini before the
// aiFill function (ADR 0016). It times the single-call request shape, where
// the model decides whether to search. Works only while the Firebase AI Logic
// API is enabled for the project (docs/runbooks/ai-fill-errors.md).

import { app } from "@/lib/firebase"
import { ensureAppCheck } from "@/lib/ai"
import { SYSTEM_PROMPT } from "../../functions/src/ai-prompt"

/** The knobs the dev bench varies; production's live in functions/src/ai-fill.ts. */
export interface AiModelConfig {
  model: string
  /** null leaves the model's default dynamic thinking in place. */
  thinkingLevel: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH" | null
}

type Model = import("firebase/ai").GenerativeModel

/** The single-call request shape for a given model config. */
export async function createModel(config: AiModelConfig): Promise<Model> {
  await ensureAppCheck()
  const aiSdk = await import("firebase/ai")
  const ai = aiSdk.getAI(app, { backend: new aiSdk.VertexAIBackend("global") })
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

// PROTOTYPE (issue #20) — the liftable core: schema, prompt, call shapes.
// No I/O, no console — the spike shell drives it and reports.
import { getGenerativeModel, Schema } from "firebase/ai";

export const MODEL_ID = "gemini-3.1-flash-lite";

// Four-tier contract as one flat object (Gemini's schema subset has no oneOf;
// Firebase AI Logic treats fields as required unless listed in optionalProperties).
// Shape per docs/research/gemini-firebase-ai-logic-macro-fill.md § Recommended Schema.
export const MACRO_FILL_SCHEMA = Schema.object({
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
    hint: Schema.string({
      description: "Fill ONLY when status is 'hopeless': one short hint.",
    }),
  },
  optionalProperties: ["food", "uncertainFields", "question", "hint"],
});

export const SYSTEM_PROMPT = `You estimate nutrition for a food diary. Input: one short free-text food description. Output: a single JSON object per the response schema.

Tier rules — pick exactly one status and fill only its fields:
- "confident": food and portion are identifiable; fill "food" with best-estimate macros.
- "unsure": identifiable, but some values are rough estimates; fill "food" AND "uncertainFields" (names of the low-confidence fields).
- "ambiguous": one blocking unknown prevents any estimate; fill only "question" — exactly one clarifying question targeting the most blocking unknown.
- "hopeless": no estimate is possible even with one clarification; fill only "hint" — one short hint about what input would work.

All macro values are for the described portion (not per 100 g); calories in kcal. For branded or region-specific foods you are not certain about, use Google Search and prefer manufacturer or retailer nutrition data.`;

// One request: grounding tool + responseSchema together (the Gemini-3 preview
// capability this spike verifies on flash-lite).
export function makeCombinedModel(ai) {
  return getGenerativeModel(ai, {
    model: MODEL_ID,
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ googleSearch: {} }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: MACRO_FILL_SCHEMA,
    },
  });
}

// Baseline: same schema, no grounding tool.
export function makeUngroundedModel(ai) {
  return getGenerativeModel(ai, {
    model: MODEL_ID,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: MACRO_FILL_SCHEMA,
    },
  });
}

// Fallback step 1: grounded free text, no schema.
export function makeGroundedTextModel(ai) {
  return getGenerativeModel(ai, {
    model: MODEL_ID,
    systemInstruction:
      "State the nutrition facts (portion, kcal, protein/carbs/fat in grams) for the described food as short plain text. Use Google Search for branded foods; prefer manufacturer data. Note anything ambiguous or unknowable.",
    tools: [{ googleSearch: {} }],
  });
}

export async function fillMacrosCombined(model, description) {
  const t0 = performance.now();
  const result = await model.generateContent(description);
  const latencyMs = Math.round(performance.now() - t0);
  return report(result.response, latencyMs, description);
}

// Documented two-step fallback: grounded text → ungrounded structuring.
export async function fillMacrosTwoStep(groundedTextModel, structuringModel, description) {
  const t0 = performance.now();
  const grounded = await groundedTextModel.generateContent(description);
  const facts = grounded.response.text();
  const step1Ms = Math.round(performance.now() - t0);

  const t1 = performance.now();
  const structured = await structuringModel.generateContent(
    `Food description: "${description}"\nResearched facts:\n${facts}`,
  );
  const step2Ms = Math.round(performance.now() - t1);

  const rep = report(structured.response, step1Ms + step2Ms, description);
  rep.twoStep = { step1Ms, step2Ms, groundedText: facts };
  // Grounding metadata lives on the step-1 response in this shape.
  rep.grounding = groundingInfo(grounded.response);
  return rep;
}

function report(response, latencyMs, description) {
  const text = response.text();
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    parseError = String(e);
  }
  return {
    description,
    latencyMs,
    parsed,
    parseError,
    rawText: text,
    grounding: groundingInfo(response),
    usage: response.usageMetadata ?? null,
    finishReason: response.candidates?.[0]?.finishReason ?? null,
  };
}

function groundingInfo(response) {
  const gm = response.candidates?.[0]?.groundingMetadata;
  if (!gm) return { grounded: false };
  return {
    grounded: true,
    webSearchQueries: gm.webSearchQueries ?? [],
    groundingChunkCount: gm.groundingChunks?.length ?? 0,
    hasSearchEntryPoint: Boolean(gm.searchEntryPoint?.renderedContent),
    searchEntryPointChars: gm.searchEntryPoint?.renderedContent?.length ?? 0,
  };
}

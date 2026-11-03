// Prompts and decision questions for the router bench. The production prompt
// is imported, so the "today" and "no search" arms send exactly what users get.
import { SYSTEM_PROMPT } from "../../src/lib/macro-fill.ts"

export { SYSTEM_PROMPT }

// ── The fill reply schema (REST form) ──────────────────────────────────────
// Mirror of buildResponseSchema() in src/lib/ai.ts. Keep the two in step.
const FOOD = {
  type: "OBJECT",
  description: "Fill when status is 'confident' or 'unsure'.",
  properties: {
    label: { type: "STRING" },
    servingText: { type: "STRING" },
    grams: { type: "NUMBER", nullable: true },
    calories: { type: "NUMBER" },
    protein_g: { type: "NUMBER" },
    carbs_g: { type: "NUMBER" },
    fat_g: { type: "NUMBER" },
  },
  required: ["label", "servingText", "calories", "protein_g", "carbs_g", "fat_g"],
}

export function fillSchema(statuses = ["confident", "unsure", "ambiguous", "hopeless"]) {
  return {
    type: "OBJECT",
    properties: {
      status: { type: "STRING", enum: statuses },
      food: FOOD,
      uncertainFields: {
        type: "ARRAY",
        description: "Fill ONLY when status is 'unsure': names of low-confidence fields.",
        items: {
          type: "STRING",
          enum: ["servingText", "grams", "calories", "protein_g", "carbs_g", "fat_g"],
        },
      },
      question: {
        type: "STRING",
        description: "Fill ONLY when status is 'ambiguous': exactly one clarifying question.",
      },
      answerChips: {
        type: "ARRAY",
        description:
          "When status is 'ambiguous': 2-4 short tap-to-answer options, each a complete answer to the question. Empty array on every other status.",
        items: { type: "STRING" },
      },
      hint: { type: "STRING", description: "Fill ONLY when status is 'hopeless': one short hint." },
    },
    required: ["status", "answerChips"],
  }
}

// ── Arm: Gemini cascade (first call, no search tool) ───────────────────────
// Stand-in for the price review thread's ROUTING_PROMPT
// (functions/src/ai-prompt.ts on its branch): answer staples, generic dishes
// and questions without search, or reply {"status":"search"}. Once that file
// is on main, run.mjs imports it instead (see loadCascadePrompt).
const SEARCH_RULE =
  /Searching: [\s\S]*$/ // the production prompt's last paragraph

export const CASCADE_FALLBACK_PROMPT =
  SYSTEM_PROMPT.replace(SEARCH_RULE, "").trimEnd() +
  `

You have no web search in this step. Answer from your knowledge for common staple foods and generic home-style dishes. If the food is a specific brand, chain or restaurant item, or a packaged or regional product whose label or menu is the source of truth, do not estimate: reply exactly {"status":"search","answerChips":[]} and nothing else.`

export async function loadCascadePrompt() {
  try {
    const mod = await import("../../functions/src/ai-prompt.ts")
    if (typeof mod.ROUTING_PROMPT === "string") {
      return {
        prompt: mod.ROUTING_PROMPT,
        // Its second step searches with its own prompt; without one, the
        // cascade reuses the bench's `search` answer.
        searchPrompt: typeof mod.SEARCH_PROMPT === "string" ? mod.SEARCH_PROMPT : null,
        source: "functions/src/ai-prompt.ts ROUTING_PROMPT + SEARCH_PROMPT",
      }
    }
  } catch {
    // Not on this branch yet.
  }
  return { prompt: CASCADE_FALLBACK_PROMPT, searchPrompt: null, source: "bench stand-in (CASCADE_FALLBACK_PROMPT)" }
}

// ── Arm: Gemini as a router (tiny classifier call) ─────────────────────────
export const GEMINI_ROUTER_PROMPT = `You route food diary entries. Input: one short food description in any language. Reply with JSON {"route": ...}:
- "staple": a generic food or simple home-style dish; standard food tables give its nutrition (fruit, vegetables, eggs, rice, pasta, bread, milk, meat, nuts, oil), with or without an amount.
- "branded": a specific brand, chain or restaurant item, or a packaged product whose label or menu is the source of truth.
- "vague": too unclear to estimate without asking one question (unknown dish, recipe or portion that changes the calories a lot).`

export const GEMINI_ROUTER_SCHEMA = {
  type: "OBJECT",
  properties: { route: { type: "STRING", enum: ["staple", "branded", "vague"] } },
  required: ["route"],
}

// ── Arms: Jev (TypeSafe System One) ────────────────────────────────────────
// One request carries both router questions; Jev answers them in parallel and
// independently, so the bench can score two router designs for one call.
export const JEV_ROUTER_QUESTIONS = {
  route: {
    type: "choice",
    instructions:
      "Which kind of food diary entry is this? The text may be in English, Spanish or German.",
    criteria: {
      staple:
        "A generic food or simple home-style dish whose nutrition standard food tables give (fruit, vegetables, eggs, rice, pasta, bread, milk, meat, nuts, oil), with or without an amount.",
      branded:
        "A specific brand, chain or restaurant item, or a packaged product whose label or menu is the source of truth.",
      vague:
        "Too unclear to estimate without asking one question: unknown dish, recipe or portion that changes the calories a lot.",
    },
  },
  needs_search: {
    type: "noul",
    instructions:
      "Getting the calories right for this entry needs a web search for a label or menu, because general nutrition knowledge is not enough.",
  },
}

/** Jev as a checker on a no-search answer: is it plausible enough to keep? */
export const JEV_CHECK_QUESTIONS = {
  plausible: {
    type: "noul",
    instructions:
      "The calories and macros in `answer` are within about 15% of the true values for the food and portion in `entry`, and protein, fat and carbs add up to roughly the calories (4, 9 and 4 kcal per gram).",
  },
}

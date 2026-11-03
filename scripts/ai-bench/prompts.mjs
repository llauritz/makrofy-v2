// Prompts, schemas and decision questions used by the bench variants.
// Production prompts are imported, never copied, so a variant named after a
// production design sends exactly what that design sends.
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { SYSTEM_PROMPT as APP_PROMPT } from "../../src/lib/macro-fill.ts"

export const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 10)

// ── The fill reply schema (REST form) ──────────────────────────────────────
// Mirror of buildResponseSchema() in src/lib/ai.ts. Keep the two in step.
// `handOver` adds the cascade's "search" status.
export function fillSchema(handOver = false) {
  return {
    type: "OBJECT",
    properties: {
      status: {
        type: "STRING",
        enum: ["confident", "unsure", "ambiguous", "hopeless", ...(handOver ? ["search"] : [])],
      },
      food: {
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
      },
      uncertainFields: {
        type: "ARRAY",
        description: "Fill ONLY when status is 'unsure': names of low-confidence fields.",
        items: { type: "STRING", enum: ["servingText", "grams", "calories", "protein_g", "carbs_g", "fat_g"] },
      },
      question: { type: "STRING", description: "Fill ONLY when status is 'ambiguous': exactly one clarifying question." },
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

// ── Prompt sets ────────────────────────────────────────────────────────────
// `app`: the single-call prompt the app sends today (src/lib/macro-fill.ts).
// `pipeline`: ROUTING_PROMPT / SEARCH_PROMPT / SYSTEM_PROMPT from
// functions/src/ai-prompt.ts (the two-step fill, ADR 0016). Read from the
// working tree when present, else from a git ref (--prompts-ref).
export async function loadPrompts(promptsRef) {
  const prompts = { app: { text: APP_PROMPT, source: "src/lib/macro-fill.ts SYSTEM_PROMPT" } }
  const file = "functions/src/ai-prompt.ts"
  let mod = null
  let source = null
  if (existsSync(file) && !promptsRef) {
    mod = await import(pathToFileURL(join(process.cwd(), file)).href)
    source = `${file} (working tree)`
  } else {
    const ref = promptsRef ?? "origin/main"
    try {
      const text = execFileSync("git", ["show", `${ref}:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      const dir = mkdtempSync(join(tmpdir(), "ai-bench-prompts-"))
      writeFileSync(join(dir, "ai-prompt.ts"), text)
      mod = await import(pathToFileURL(join(dir, "ai-prompt.ts")).href)
      source = `${file} at ${ref} (${execFileSync("git", ["rev-parse", "--short", ref], { encoding: "utf8" }).trim()})`
    } catch {
      // Not available at that ref: variants that need it refuse to run.
    }
  }
  for (const name of ["ROUTING_PROMPT", "SEARCH_PROMPT", "SYSTEM_PROMPT"]) {
    if (typeof mod?.[name] === "string") prompts[name] = { text: mod[name], source: `${source} ${name}` }
  }
  for (const p of Object.values(prompts)) p.sha = sha(p.text)
  return prompts
}

// ── Gemini as a three-way router ───────────────────────────────────────────
export const GEMINI_ROUTER_PROMPT = `You route food diary entries. Input: one short food description in any language. Reply with JSON {"route": ...}:
- "staple": a generic food or simple home-style dish; standard food tables give its nutrition (fruit, vegetables, eggs, rice, pasta, bread, milk, meat, nuts, oil), with or without an amount.
- "branded": a specific brand, chain or restaurant item, or a packaged product whose label or menu is the source of truth.
- "vague": too unclear to estimate without asking one question (unknown dish, recipe or portion that changes the calories a lot).`

export const GEMINI_ROUTER_SCHEMA = {
  type: "OBJECT",
  properties: { route: { type: "STRING", enum: ["staple", "branded", "vague"] } },
  required: ["route"],
}

// ── Jev questions ──────────────────────────────────────────────────────────
export const JEV_ROUTER_QUESTIONS = {
  route: {
    type: "choice",
    instructions: "Which kind of food diary entry is this? The text may be in English, Spanish or German.",
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

export const JEV_CHECK_QUESTIONS = {
  plausible: {
    type: "noul",
    instructions:
      "The calories and macros in `answer` are within about 15% of the true values for the food and portion in `entry`, and protein, fat and carbs add up to roughly the calories (4, 9 and 4 kcal per gram).",
  },
}

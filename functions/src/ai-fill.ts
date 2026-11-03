import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type GenerateContentResponse,
  type Schema,
} from "@google/genai"
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore"

import {
  admitCall,
  CYCLE_LIMIT,
  cycleDocId,
  cycleWindow,
  effectivePlan,
  NO_COUNTS,
  type CycleCounts,
  type Refusal,
} from "./ai-allowance.js"
import type { AiFailureReport } from "./ai-failure.js"
import { ROUTING_PROMPT, SEARCH_PROMPT, SYSTEM_PROMPT } from "./ai-prompt.js"
import type { Plan, SubscriptionStatus } from "./entitlement.js"

// The AI fill on the server (ADR 0016). The phone used to call Gemini itself
// through Firebase AI Logic and count its own fills, so the plan limits were
// advisory and a script could run up the search bill. Now the aiFill callable
// does both: it admits the round trip against the plan's allowance in one
// transaction, calls Gemini, and counts what the call cost.

// 3.5 Flash-Lite at LOW thinking: a food lookup needs no deep reasoning, and
// thinking time sits directly in the user's wait (model swap 2026-11-01).
export const MODEL_ID = "gemini-3.5-flash-lite"

/**
 * "two-step": answer without search first and search only for a food whose
 * label or menu is the source of truth (cheaper; staples answer faster,
 * branded foods take one extra short call). "single": one call where the
 * model decides whether to search, as before Nov 2026.
 */
export type SearchMode = "two-step" | "single"
export const SEARCH_MODE: SearchMode = "two-step"

/** Longest prompt accepted: a description plus a question and its answer. */
export const MAX_PROMPT_CHARS = 1_500

/** Google's own timeout per Gemini call; a fill never waits longer. */
const CALL_TIMEOUT_MS = 30_000

export interface AiFillRequest {
  prompt: string
  /** The answer to a clarifying question: a call, not a new fill. */
  final: boolean
}

export interface AiFillResponse {
  /** The model's JSON reply, validated by the app (src/lib/macro-fill.ts). */
  text: string
  /** Google Search Suggestions HTML, shown whenever the answer searched. */
  attribution: string | null
  finishReason: string | null
}

/** The request as the app sent it, or null when it isn't one. */
export function parseRequest(raw: unknown): AiFillRequest | null {
  const d = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >
  const prompt = typeof d.prompt === "string" ? d.prompt.trim() : ""
  if (prompt === "" || prompt.length > MAX_PROMPT_CHARS) return null
  return { prompt, final: d.final === true }
}

// ── Admission ────────────────────────────────────────────────────────────────

export interface Admitted {
  ok: true
  cycleRef: DocumentReference
  plan: Plan
}

export interface Refused {
  ok: false
  refusal: Refusal
  plan: Plan
  limit: number
  resetsOn: Date
}

const asDate = (v: unknown): Date | null =>
  v instanceof Timestamp ? v.toDate() : null

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0

/**
 * Admit one round trip for `uid`, or refuse it. The plan comes from the
 * webhook-written entitlement doc; the cycle is anchored on its planStartedAt,
 * or on when the account was created for someone who has never bought — the
 * same doc the app's counter listens to. Counting happens in the same
 * transaction as the check, so two phones can't both take the last fill.
 */
export async function admitAiCall(
  db: Firestore,
  uid: string,
  {
    final,
    now,
    accountCreated,
  }: { final: boolean; now: Date; accountCreated: () => Promise<Date> }
): Promise<Admitted | Refused> {
  const user = db.collection("users").doc(uid)
  const ent = (await user.collection("settings").doc("subscription").get()).data()
  const planStartedAt = asDate(ent?.planStartedAt)
  const docPlan = ent?.plan
  const valid =
    planStartedAt !== null &&
    (docPlan === "free" || docPlan === "pro" || docPlan === "unlimited")
  const plan = valid
    ? effectivePlan(
        {
          plan: docPlan,
          status: (ent?.status as SubscriptionStatus) ?? "canceled",
          currentPeriodEnd: asDate(ent?.currentPeriodEnd),
        },
        now
      )
    : "free"
  const anchor = valid ? planStartedAt : await accountCreated()
  const span = cycleWindow(anchor, now)
  const limit = CYCLE_LIMIT[plan]
  const cycleRef = user.collection("aiCycles").doc(cycleDocId(span.start))

  const admission = await db.runTransaction(async (tx) => {
    const data = (await tx.get(cycleRef)).data()
    const counts: CycleCounts = data
      ? {
          fills: num(data.fills),
          calls: num(data.calls),
          burstStartMs: num(data.burstStartMs),
          burstCalls: num(data.burstCalls),
        }
      : NO_COUNTS
    const result = admitCall(counts, { final, limit, nowMs: now.getTime() })
    if (result.ok) {
      tx.set(
        cycleRef,
        { ...result.next, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      )
    }
    return result
  })
  return admission.ok
    ? { ok: true, cycleRef, plan }
    : {
        ok: false,
        refusal: admission.refusal,
        plan,
        limit,
        resetsOn: span.end,
      }
}

/**
 * Count what one answered round trip cost: on the user's cycle doc (the
 * app's counter, and what ADR 0013's monthly check reads) and in a daily
 * total for the whole app at /aiStats/{UTC day}, which the price review
 * reads. Fire and forget from the caller's side.
 */
export async function recordAiCost(
  db: Firestore,
  cycleRef: DocumentReference,
  { final, queries, steps, now }: CallCost & { final: boolean; now: Date }
): Promise<void> {
  const grounded = queries > 0 ? 1 : 0
  const batch = db.batch()
  batch.set(
    cycleRef,
    {
      grounded: FieldValue.increment(grounded),
      queries: FieldValue.increment(queries),
    },
    { merge: true }
  )
  batch.set(
    db.collection("aiStats").doc(now.toISOString().slice(0, 10)),
    {
      fills: FieldValue.increment(final ? 0 : 1),
      calls: FieldValue.increment(1),
      geminiCalls: FieldValue.increment(steps),
      grounded: FieldValue.increment(grounded),
      queries: FieldValue.increment(queries),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
  await batch.commit()
}

// ── Gemini ───────────────────────────────────────────────────────────────────

const FOOD_FIELDS = [
  "servingText",
  "grams",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
]

/**
 * The four-tier wire schema (docs/research/gemini-firebase-ai-logic-macro-fill.md
 * § Recommended Schema). The routing step adds a fifth status, "search", that
 * hands the food over to the search step. answerChips is deliberately
 * required: flash-lite reliably omits optional fields it is only told to fill.
 */
export function responseSchema(routing: boolean): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      status: {
        type: Type.STRING,
        format: "enum",
        enum: [
          "confident",
          "unsure",
          "ambiguous",
          "hopeless",
          ...(routing ? ["search"] : []),
        ],
      },
      food: {
        type: Type.OBJECT,
        description: "Fill when status is 'confident' or 'unsure'.",
        properties: {
          label: { type: Type.STRING },
          servingText: { type: Type.STRING },
          grams: { type: Type.NUMBER, nullable: true },
          calories: { type: Type.NUMBER },
          protein_g: { type: Type.NUMBER },
          carbs_g: { type: Type.NUMBER },
          fat_g: { type: Type.NUMBER },
        },
        required: [
          "label",
          "servingText",
          "calories",
          "protein_g",
          "carbs_g",
          "fat_g",
        ],
      },
      uncertainFields: {
        type: Type.ARRAY,
        description:
          "Fill ONLY when status is 'unsure': names of low-confidence fields.",
        items: { type: Type.STRING, format: "enum", enum: FOOD_FIELDS },
      },
      question: {
        type: Type.STRING,
        description:
          "Fill ONLY when status is 'ambiguous': exactly one clarifying question.",
      },
      answerChips: {
        type: Type.ARRAY,
        description:
          "When status is 'ambiguous': 2-4 short tap-to-answer options, each a complete answer to the question. Empty array on every other status.",
        items: { type: Type.STRING },
      },
      hint: {
        type: Type.STRING,
        description: "Fill ONLY when status is 'hopeless': one short hint.",
      },
    },
    required: ["status", "answerChips"],
  }
}

let client: GoogleGenAI | null = null

function gemini(): GoogleGenAI {
  // Gemini 3 models live on the `global` endpoint (us-central1 404s for them).
  client ??= new GoogleGenAI({
    vertexai: true,
    project: process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT,
    location: "global",
  })
  return client
}

async function generate(
  prompt: string,
  systemInstruction: string,
  { search, routing }: { search: boolean; routing: boolean }
): Promise<GenerateContentResponse> {
  return gemini().models.generateContent({
    model: MODEL_ID,
    contents: prompt,
    config: {
      systemInstruction,
      ...(search && { tools: [{ googleSearch: {} }] }),
      responseMimeType: "application/json",
      responseSchema: responseSchema(routing),
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      httpOptions: { timeout: CALL_TIMEOUT_MS },
    },
  })
}

/** The reply's status field, or null when it isn't JSON with one. */
export function replyStatus(text: string): string | null {
  try {
    const data: unknown = JSON.parse(text)
    return typeof data === "object" &&
      data !== null &&
      typeof (data as { status?: unknown }).status === "string"
      ? (data as { status: string }).status
      : null
  } catch {
    return null
  }
}

/** Billed search queries behind one Gemini reply. */
export function searchQueries(response: GenerateContentResponse): number {
  const meta = response.candidates?.[0]?.groundingMetadata
  const queries = meta?.webSearchQueries?.length ?? 0
  // A reply with Search attribution but no listed queries still searched.
  return queries === 0 && meta?.searchEntryPoint?.renderedContent ? 1 : queries
}

export interface CallCost {
  /** Billed search queries. */
  queries: number
  /** Gemini calls made: 1, or 2 when the routing step handed over. */
  steps: number
}

/** One round trip's answer, run in the configured search mode. */
export async function runGemini(
  prompt: string,
  mode: SearchMode = SEARCH_MODE
): Promise<AiFillResponse & CallCost> {
  let response: GenerateContentResponse
  let steps = 1
  if (mode === "single") {
    response = await generate(prompt, SYSTEM_PROMPT, {
      search: true,
      routing: false,
    })
  } else {
    response = await generate(prompt, ROUTING_PROMPT, {
      search: false,
      routing: true,
    })
    if (replyStatus(response.text ?? "") === "search") {
      steps = 2
      response = await generate(prompt, SEARCH_PROMPT, {
        search: true,
        routing: false,
      })
    }
  }
  const candidate = response.candidates?.[0]
  return {
    text: response.text ?? "",
    attribution:
      candidate?.groundingMetadata?.searchEntryPoint?.renderedContent || null,
    finishReason: candidate?.finishReason ?? null,
    queries: searchQueries(response),
    steps,
  }
}

/** A failed Gemini call as an ADR 0014 failure report (no food text). */
export function describeGeminiError(
  err: unknown,
  { ms, final }: { ms: number; final: boolean }
): AiFailureReport {
  const name = err instanceof Error ? err.name : null
  const message = err instanceof Error ? err.message : String(err)
  const status = (err as { status?: unknown } | null)?.status
  const timeout =
    name === "AbortError" || name === "TimeoutError" || /timed? ?out/i.test(message)
  return {
    code: timeout ? "TimeoutError" : "upstream",
    // The SDK's ApiError carries Google's HTTP status.
    status: typeof status === "number" ? status : null,
    reason: null,
    finishReason: null,
    message: message.slice(0, 400),
    model: MODEL_ID,
    online: true,
    ms: Math.round(ms),
    final,
  }
}

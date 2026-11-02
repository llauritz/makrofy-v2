import type { AiFailureReport } from "../../functions/src/ai-failure"

// The phone's half of AI fill error monitoring (ADR 0014): turn a failed
// round trip into a small report for the reportAiFailure function, which
// decides whose problem it is. The report carries the error's facts only —
// never the food text the user typed. Pure, so it's tested on real SDK
// errors; ai.ts sends it.

interface Context {
  model: string
  /** Milliseconds from sending to failing. */
  ms: number
  final: boolean
}

type ErrorLike = {
  name?: unknown
  code?: unknown
  message?: unknown
  customErrorData?: {
    status?: unknown
    errorDetails?: { reason?: unknown }[]
    response?: {
      candidates?: { finishReason?: unknown }[]
      promptFeedback?: { blockReason?: unknown }
    }
  }
}

const text = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null

const online = () =>
  typeof navigator === "undefined" ? true : navigator.onLine !== false

/** The report for an exception thrown by the AI SDK (or by our own code). */
export function describeAiError(err: unknown, ctx: Context): AiFailureReport {
  const e = (typeof err === "object" && err !== null ? err : {}) as ErrorLike
  const data = e.customErrorData
  const name = text(e.name)
  // AIError (a FirebaseError) carries the SDK's code; anything else is known
  // by its JS name — TypeError, AbortError, …
  const code =
    (name === "FirebaseError" ? text(e.code) : null) ?? name ?? "unknown"
  const response = data?.response
  return {
    code,
    status: typeof data?.status === "number" ? data.status : null,
    reason:
      data?.errorDetails?.map((d) => text(d?.reason)).find(Boolean) ?? null,
    finishReason:
      text(response?.candidates?.[0]?.finishReason) ??
      text(response?.promptFeedback?.blockReason),
    message: (text(e.message) ?? String(err)).slice(0, 400),
    model: ctx.model,
    online: online(),
    ms: Math.round(ctx.ms),
    final: ctx.final,
  }
}

/** The report for a reply that arrived but broke the four-tier contract. */
export function describeBadOutput(
  finishReason: string | null,
  textLength: number,
  ctx: Context
): AiFailureReport {
  return {
    code: "bad-output",
    status: null,
    reason: null,
    finishReason,
    message: `Reply outside the contract (${textLength} characters)`,
    model: ctx.model,
    online: online(),
    ms: Math.round(ctx.ms),
    final: ctx.final,
  }
}

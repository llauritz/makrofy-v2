// What went wrong with an AI fill, and whose problem it is (ADR 0014).
//
// Gemini runs in the aiFill function (ADR 0016), which reports its own failed
// calls; the phone reports the trips that failed before or after it (no
// connection, App Check, a reply it can't read). Both send the bare facts of
// the failure — never the food text the user typed — and this module decides
// who has to act:
//
//   ours    — something we must fix: a bad request, a retired model, a quota
//             we set too low, a reply our parser can't read, a crash in our
//             own code.
//   google  — Google's side is failing: 5xx, overload, a hung request, a
//             reply blocked by Google's filters. Nothing to fix; wait it out.
//   device  — this one phone: no connection, or App Check refused it (often
//             an ad blocker stopping reCAPTCHA). Only a problem when many
//             phones report it at once — the health check watches for that.
//   unknown — anything this table doesn't recognise yet. Read the message
//             and add a rule.
//
// Shared by the reporting callable and the 15-minute health check; the app
// imports only the types.

export type Blame = "ours" | "google" | "device" | "unknown"

/**
 * One failed round trip, as the phone reports it. Every field is optional on
 * the wire; sanitizeReport() trims what arrives to these shapes.
 */
export interface AiFailureReport {
  /**
   * The SDK's AIErrorCode ("fetch-error", "response-error", …), "bad-output"
   * when the model answered outside our contract, or the JS error's name for
   * anything that isn't an AIError.
   */
  code: string
  /** HTTP status from Google, when there was a response. */
  status: number | null
  /** errorDetails[].reason from Google's error body, if any. */
  reason: string | null
  /** The candidate's finishReason or the prompt's blockReason. */
  finishReason: string | null
  /** The error message, cut short. Never contains the user's food text. */
  message: string
  model: string
  /** navigator.onLine when it failed. */
  online: boolean
  /** Milliseconds from sending to failing. */
  ms: number | null
  /** The answer to a clarifying question (second round trip). */
  final: boolean
}

export interface Classified {
  blame: Blame
  /** A short, stable label for grouping: "unavailable", "app-check", … */
  kind: string
}

// Every AIErrorCode the SDK can throw (firebase/ai). Anything else in `code`
// is a JS error name.
const SDK_CODES = new Set([
  "error",
  "request-error",
  "response-error",
  "fetch-error",
  "session-closed",
  "invalid-content",
  "api-not-enabled",
  "invalid-schema",
  "no-api-key",
  "no-app-id",
  "no-model",
  "no-project-id",
  "parse-failed",
  "unsupported",
])

const CONFIG_CODES = new Set([
  "api-not-enabled",
  "invalid-schema",
  "invalid-content",
  "no-api-key",
  "no-app-id",
  "no-model",
  "no-project-id",
  "request-error",
  "unsupported",
])

// Google's per-user or per-project quotas: limits we set (AI Logic's per-user
// rate limit) or can ask to raise. Vertex's shared-capacity 429 ("Resource
// exhausted, please try again later") has none of these words.
const OWN_QUOTA = /per[ -]user|quota metric|quota exceeded|quota_limit/i

const CHUNK_LOAD =
  /dynamically imported module|importing a module script failed|loading chunk/i

const NETWORK = /failed to fetch|network|load failed|connection|offline/i

export function classifyAiFailure(r: AiFailureReport): Classified {
  if (r.code === "bad-output") return { blame: "ours", kind: "bad-output" }
  if (CONFIG_CODES.has(r.code)) return { blame: "ours", kind: "config" }
  if (r.code === "response-error") {
    // A reply came back but Google's filters (or the model) withheld it.
    return { blame: "google", kind: "blocked" }
  }
  if (r.code.startsWith("appCheck/")) {
    return { blame: "device", kind: "app-check" }
  }
  if (r.code.startsWith("functions/")) return classifyCallable(r)
  if (r.code === "parse-failed")
    return { blame: "google", kind: "bad-response" }
  if (r.code === "AbortError" || r.code === "TimeoutError") {
    return { blame: "google", kind: "timeout" }
  }

  const s = r.status
  if (s !== null) {
    if (s === 400) return { blame: "ours", kind: "bad-request" }
    if (s === 401) return { blame: "device", kind: "app-check" }
    if (s === 403) return { blame: "ours", kind: "permission" }
    if (s === 404) return { blame: "ours", kind: "model-missing" }
    if (s === 429) {
      return OWN_QUOTA.test(`${r.reason ?? ""} ${r.message}`)
        ? { blame: "ours", kind: "quota" }
        : { blame: "google", kind: "overloaded" }
    }
    if (s === 503) return { blame: "google", kind: "unavailable" }
    if (s === 504) return { blame: "google", kind: "timeout" }
    if (s >= 500) return { blame: "google", kind: "server-error" }
  }

  if (r.code === "upstream") {
    // The aiFill function couldn't reach Gemini at all (no HTTP status).
    return { blame: "google", kind: "unreachable" }
  }

  if (r.code === "error" || r.code === "fetch-error") {
    // The SDK wraps a fetch that never got an answer as code "error".
    if (!r.online || NETWORK.test(r.message)) {
      return { blame: "device", kind: "network" }
    }
  } else if (CHUNK_LOAD.test(r.message)) {
    // The app's own code chunk didn't load: offline, or — online — an old
    // tab asking for a file the last deploy replaced.
    return r.online
      ? { blame: "ours", kind: "chunk-load" }
      : { blame: "device", kind: "network" }
  } else if (r.code !== "unknown" && !SDK_CODES.has(r.code)) {
    // A plain JS error name (TypeError, RangeError, …): our own code threw.
    return { blame: "ours", kind: "app-crash" }
  }
  return { blame: "unknown", kind: r.code || "unknown" }
}

/**
 * A failure of the aiFill callable as the phone saw it (ADR 0016). Gemini's
 * own errors are reported by the function itself, so these are the trips
 * that never got that far, or never got an answer back.
 */
function classifyCallable(r: AiFailureReport): Classified {
  switch (r.code) {
    case "functions/unauthenticated":
      // enforceAppCheck refuses a phone without a valid App Check token.
      return { blame: "device", kind: "app-check" }
    case "functions/not-found":
    case "functions/invalid-argument":
    case "functions/failed-precondition":
    case "functions/permission-denied":
      return { blame: "ours", kind: "config" }
    case "functions/deadline-exceeded":
      return r.online
        ? { blame: "google", kind: "timeout" }
        : { blame: "device", kind: "network" }
    case "functions/unavailable":
    case "functions/internal":
    case "functions/unknown":
      if (!r.online || NETWORK.test(r.message)) {
        return { blame: "device", kind: "network" }
      }
      return { blame: "ours", kind: "function-error" }
  }
  return { blame: "unknown", kind: r.code }
}

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v !== "" ? v.slice(0, max) : null

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null

/** Whatever the phone sent, cut down to the report's shape and sizes. */
export function sanitizeReport(raw: unknown): AiFailureReport {
  const d = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >
  return {
    code: str(d.code, 60) ?? "unknown",
    status: num(d.status),
    reason: str(d.reason, 80),
    finishReason: str(d.finishReason, 60),
    message: str(d.message, 400) ?? "",
    model: str(d.model, 60) ?? "unknown",
    online: d.online !== false,
    ms: num(d.ms),
    final: d.final === true,
  }
}

// REST clients for the bench. Gemini goes to the Vertex AI `global` endpoint
// (the production backend) with gcloud user credentials, or to the Gemini
// Developer API when GEMINI_API_KEY is set. Jev goes to TypeSafe's API.
// Every call returns { ms, usage: {input, output}, ... } or { ms, error }.
import { execFileSync } from "node:child_process"

let token = null
let tokenAt = 0
function vertexToken() {
  // Refreshed well inside the token's 60-minute life.
  if (!token || Date.now() - tokenAt > 40 * 60_000) {
    token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim()
    tokenAt = Date.now()
  }
  return token
}

export function geminiClient({ project }) {
  const apiKey = process.env.GEMINI_API_KEY
  const backend = apiKey ? "gemini-developer-api" : `vertex-global (${project})`

  /** @param {{model: string, thinking: string|null, system: string, user: string, schema: object, search: boolean}} req */
  async function generate({ model, thinking, system, user, schema, search }) {
    const url = apiKey
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
      : `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      ...(search && { tools: [{ googleSearch: {} }] }),
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        ...(thinking && { thinkingConfig: { thinkingLevel: thinking } }),
      },
    }
    const headers = { "content-type": "application/json" }
    if (apiKey) headers["x-goog-api-key"] = apiKey
    else {
      headers.authorization = `Bearer ${vertexToken()}`
      headers["x-goog-user-project"] = project
    }
    const t0 = performance.now()
    try {
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      const ms = Math.round(performance.now() - t0)
      if (!res.ok) return { ms, error: `${res.status} ${json?.error?.message ?? ""}`.trim() }
      const cand = json.candidates?.[0]
      const text = (cand?.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text)
        .join("")
      const meta = cand?.groundingMetadata
      const u = json.usageMetadata ?? {}
      return {
        ms,
        text,
        finishReason: cand?.finishReason ?? null,
        queries: meta?.webSearchQueries?.length ?? 0,
        usage: {
          input: (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0),
          output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
          thoughts: u.thoughtsTokenCount ?? 0,
        },
      }
    } catch (e) {
      return { ms: Math.round(performance.now() - t0), error: String(e) }
    }
  }
  return { generate, backend }
}

export function jevClient() {
  const key = process.env.TYPESAFE_API_KEY
  if (!key) return null

  /** @param {{model: string, state: unknown, questions: object}} req */
  async function decide({ model, state, questions }) {
    const t0 = performance.now()
    try {
      const res = await fetch("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ state, model, questions }),
      })
      const json = await res.json().catch(() => ({}))
      const ms = Math.round(performance.now() - t0)
      if (!res.ok) return { ms, error: `${res.status} ${JSON.stringify(json).slice(0, 200)}` }
      const u = json.usage ?? {}
      const input =
        u.input_tokens ?? u.prompt_tokens ?? u.inputTokens ?? u.total_tokens ??
        Math.ceil(JSON.stringify({ state, questions }).length / 4)
      return { ms, answers: json.answers ?? {}, resolved: json.model ?? model, usage: { input, output: 0 } }
    } catch (e) {
      return { ms: Math.round(performance.now() - t0), error: String(e) }
    }
  }
  return { decide }
}

// ── Mock clients (--mock): fake replies that exercise the plumbing ────────
// Replies are synthetic: the numbers in a mock report mean nothing.
export function mockClients(foods) {
  const byText = new Map(foods.map((f) => [f.text, f]))
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const foodOf = (user) => byText.get(user) ?? { kind: "staple" }

  function fakeFill(f, search, canHandOver) {
    if (f.kind === "vague") return { status: "ambiguous", question: "What kind is it?", answerChips: ["A", "B"] }
    if (f.kind === "branded" && canHandOver) return { status: "search", answerChips: [] }
    const ref = f.ref ?? { kcal: 200, p: 10, f: 8, c: 20 }
    const k = 1 + (rnd() - 0.5) * (f.kind === "branded" && !search ? 0.4 : 0.1)
    return {
      status: "confident",
      food: {
        label: f.text, servingText: "1 portion", grams: null,
        calories: Math.round(ref.kcal * k), protein_g: ref.p, carbs_g: ref.c, fat_g: ref.f,
      },
      answerChips: [],
    }
  }

  const gemini = {
    backend: "mock",
    async generate({ system, user, schema, search }) {
      const f = foodOf(user)
      const usage = { input: 600, output: 90, thoughts: 0 }
      if (schema.properties.route) {
        return { ms: 900, text: JSON.stringify({ route: rnd() < 0.9 ? f.kind : "staple" }), queries: 0, usage }
      }
      const out = fakeFill(f, search, system.includes('"status":"search"'))
      const queries = search ? (f.kind === "staple" && rnd() < 0.5 ? 0 : 1 + Math.floor(rnd() * 2)) : 0
      return { ms: Math.round((search ? 2800 : 1500) + rnd() * 900), text: JSON.stringify(out), queries, usage }
    },
  }

  const jev = {
    async decide({ state, questions }) {
      const f = byText.get(state.entry) ?? { kind: "staple" }
      const answers = {}
      for (const [id, q] of Object.entries(questions)) {
        if (q.type === "noul") {
          answers[id] = { type: "noul", noul: id === "needs_search" ? (f.kind === "branded" ? 0.8 : 0.2) : 0.5 + rnd() / 2 }
        } else {
          const keys = Object.keys(q.criteria)
          const choice = id === "route" ? (rnd() < 0.9 ? f.kind : "vague") : keys[0]
          answers[id] = { type: "choice", choice, confidence: 0.7 + rnd() * 0.3 }
        }
      }
      return { ms: Math.round(200 + rnd() * 100), answers, resolved: "mock-jev", usage: { input: 300, output: 0 } }
    },
  }
  return { gemini, jev }
}

// Thin REST clients for the router bench: Gemini (Vertex AI, same `global`
// endpoint as production, or the Gemini Developer API) and Jev (TypeSafe).
// Each call returns { ms, text|answers, usage, queries, grounded, error }.
import { execFileSync } from "node:child_process"

// ── Gemini ─────────────────────────────────────────────────────────────────
let token = null
let tokenAt = 0
function vertexToken() {
  // User credentials from `gcloud auth login`; refreshed well inside the 60-min life.
  if (!token || Date.now() - tokenAt > 40 * 60_000) {
    token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim()
    tokenAt = Date.now()
  }
  return token
}

export function geminiClient({ project, model, thinkingLevel }) {
  const apiKey = process.env.GEMINI_API_KEY
  const url = apiKey
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    : `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`
  const backend = apiKey ? "gemini-developer-api" : "vertex-global"

  /** @param {{system: string, user: string, schema: object, search: boolean}} req */
  async function generate({ system, user, schema, search }) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      ...(search && { tools: [{ googleSearch: {} }] }),
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        ...(thinkingLevel && { thinkingConfig: { thinkingLevel } }),
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
      const json = await res.json()
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
        grounded: Boolean(meta?.searchEntryPoint?.renderedContent),
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
  return { generate, backend, model, thinkingLevel }
}

// ── Jev (TypeSafe System One) ──────────────────────────────────────────────
export function jevClient({ model }) {
  const key = process.env.TYPESAFE_API_KEY
  if (!key) return null

  /** @param {{state: unknown, questions: object}} req */
  async function decide({ state, questions }) {
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
      return { ms, answers: json.answers ?? {}, model: json.model ?? model, usage: { input, output: 0 } }
    } catch (e) {
      return { ms: Math.round(performance.now() - t0), error: String(e) }
    }
  }
  return { decide, model }
}

// ── Mock clients (`--mock`): exercise the bench end to end with no keys ────
// Replies are synthetic and only test the plumbing and the report.
export function mockClients(foods) {
  const byText = new Map(foods.map((f) => [f.text, f]))
  const rnd = (() => {
    let s = 7
    return () => ((s = (s * 16807) % 2147483647) / 2147483647)
  })()
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const foodOf = (user) => byText.get(user) ?? byText.get(JSON.parse(user).entry) ?? { kind: "staple" }

  function fakeFill(f, search) {
    if (f.kind === "vague") {
      return { status: "ambiguous", question: "What kind is it?", answerChips: ["A", "B"] }
    }
    if (f.kind === "branded" && !search && rnd() < 0.5) {
      return { status: "search", answerChips: [] }
    }
    const ref = f.ref ?? { kcal: 200, p: 10, f: 8, c: 20 }
    const k = 1 + (rnd() - 0.5) * (f.kind === "branded" && !search ? 0.4 : 0.12)
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
    backend: "mock", model: "mock-gemini", thinkingLevel: "LOW",
    async generate({ system, user, schema, search }) {
      const f = foodOf(user)
      const ms = Math.round((search ? 2800 : 1700) + rnd() * 900)
      await sleep(2)
      const usage = { input: 600, output: 90, thoughts: 0 }
      if (schema.properties.route) {
        const route = rnd() < 0.85 ? f.kind : "staple"
        return { ms: 900, text: JSON.stringify({ route }), grounded: false, queries: 0, usage: { input: 250, output: 5, thoughts: 0 } }
      }
      const allowSearchStatus = system.includes('"status":"search"')
      let out = fakeFill(f, search)
      if (out.status === "search" && !allowSearchStatus) out = fakeFill({ ...f, kind: "staple" }, false)
      const queries = search ? (f.kind === "staple" && rnd() < 0.5 ? 0 : 1 + Math.floor(rnd() * 2)) : 0
      return { ms, text: JSON.stringify(out), grounded: queries > 0, queries, usage }
    },
  }
  const jev = {
    model: "mock-jev",
    async decide({ state, questions }) {
      await sleep(1)
      if (questions.plausible) {
        return { ms: 300, answers: { plausible: { type: "noul", noul: rnd() } }, usage: { input: 150, output: 0 } }
      }
      const f = byText.get(state.entry) ?? { kind: "staple" }
      const choice = rnd() < 0.9 ? f.kind : "vague"
      return {
        ms: Math.round(250 + rnd() * 150),
        answers: {
          route: { type: "choice", choice, confidence: 0.8 },
          needs_search: { type: "noul", noul: f.kind === "branded" ? 0.8 : 0.2 },
        },
        usage: { input: 220, output: 0 },
      }
    },
  }
  return { gemini, jev }
}

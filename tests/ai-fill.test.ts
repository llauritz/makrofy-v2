// Seam: the aiFill function's pure parts (ADR 0016) — what request it accepts,
// how it reads a reply's status and its billed search queries, how a failed
// Gemini call becomes a failure report — plus the phone's side: how a callable
// failure is classified and how the counter shows a fill still on its way.
import { FunctionsError } from "firebase/functions"
import { describe, expect, it } from "vitest"

import {
  classifyAiFailure,
  sanitizeReport,
} from "../functions/src/ai-failure"
import {
  describeGeminiError,
  MAX_PROMPT_CHARS,
  parseRequest,
  replyStatus,
  responseSchema,
  runGemini,
  SEARCH_MODE,
  SEARCH_TIMEOUT_MS,
  searchQueries,
  type Generate,
} from "../functions/src/ai-fill"
import {
  ESTIMATE_PROMPT,
  ROUTING_PROMPT,
  SEARCH_PROMPT,
  SYSTEM_PROMPT,
} from "../functions/src/ai-prompt"
import { shownFills } from "@/data/ai-pending"
import { describeAiError } from "@/lib/ai-report"

describe("parseRequest", () => {
  it("takes a prompt and whether it answers a question", () => {
    expect(parseRequest({ prompt: " 1 banana ", final: false })).toEqual({
      prompt: "1 banana",
      final: false,
    })
    expect(parseRequest({ prompt: "x", final: true })?.final).toBe(true)
    expect(parseRequest({ prompt: "x", final: "yes" })?.final).toBe(false)
  })

  it("refuses an empty, missing or oversized prompt", () => {
    expect(parseRequest({ prompt: "  " })).toBeNull()
    expect(parseRequest({})).toBeNull()
    expect(parseRequest(null)).toBeNull()
    expect(parseRequest({ prompt: "a".repeat(MAX_PROMPT_CHARS + 1) })).toBeNull()
  })
})

describe("search mode", () => {
  it("stays on the single call until two-step has been benchmarked", () => {
    expect(SEARCH_MODE).toBe("single")
  })
})

describe("two-step search", () => {
  it("lets only the routing step hand a food over to search", () => {
    const status = (routing: boolean) =>
      (responseSchema(routing).properties?.status?.enum ?? []) as string[]
    expect(status(true)).toContain("search")
    expect(status(false)).not.toContain("search")
    expect(ROUTING_PROMPT).toContain('{"status":"search","answerChips":[]}')
    expect(SEARCH_PROMPT).toContain("one search query, two at most")
  })

  it("reads the status of a reply", () => {
    expect(replyStatus('{"status":"search","answerChips":[]}')).toBe("search")
    expect(replyStatus('{"status":"confident"}')).toBe("confident")
    expect(replyStatus("not json")).toBeNull()
    expect(replyStatus('{"food":{}}')).toBeNull()
  })

  it("counts every billed search query, not just whether it searched", () => {
    const reply = (meta: object | undefined) =>
      ({ candidates: [{ groundingMetadata: meta }] }) as Parameters<
        typeof searchQueries
      >[0]
    expect(searchQueries(reply(undefined))).toBe(0)
    expect(searchQueries(reply({ webSearchQueries: ["a", "b", "c"] }))).toBe(3)
    expect(
      searchQueries(reply({ searchEntryPoint: { renderedContent: "<div/>" } })),
    ).toBe(1)
  })
})

describe("runGemini", () => {
  type Reply = Awaited<ReturnType<Generate>>
  const reply = (status: string, meta?: object) =>
    ({
      text: JSON.stringify({ status, answerChips: [] }),
      candidates: [{ finishReason: "STOP", groundingMetadata: meta }],
    }) as unknown as Reply
  const timeout = () =>
    Object.assign(new Error("The operation was aborted"), { name: "AbortError" })

  function stub(steps: ((system: string) => Reply | Error)[]) {
    const calls: { system: string; search: boolean; timeoutMs?: number }[] = []
    const generate: Generate = async (_prompt, system, options) => {
      calls.push({ system, search: options.search, timeoutMs: options.timeoutMs })
      const next = steps[calls.length - 1](system)
      if (next instanceof Error) throw next
      return next
    }
    return { calls, generate }
  }

  it("runs the live single call by default: one request, search allowed", async () => {
    const { calls, generate } = stub([() => reply("confident")])
    const r = await runGemini("Big Mac", undefined, generate)
    expect(r).toMatchObject({ steps: 1, searchTimedOut: false })
    expect(calls).toEqual([{ system: SYSTEM_PROMPT, search: true, timeoutMs: undefined }])
  })

  it("answers a staple in one call without search", async () => {
    const { calls, generate } = stub([() => reply("confident")])
    const r = await runGemini("1 banana", "two-step", generate)
    expect(r).toMatchObject({ steps: 1, queries: 0, searchTimedOut: false })
    expect(calls).toEqual([{ system: ROUTING_PROMPT, search: false, timeoutMs: undefined }])
  })

  it("hands a brand over to the search step, with its own time limit", async () => {
    const { calls, generate } = stub([
      () => reply("search"),
      () => reply("confident", { webSearchQueries: ["big mac nutrition"] }),
    ])
    const r = await runGemini("Big Mac", "two-step", generate)
    expect(r).toMatchObject({ steps: 2, queries: 1, searchTimedOut: false })
    expect(calls[1]).toEqual({
      system: SEARCH_PROMPT,
      search: true,
      timeoutMs: SEARCH_TIMEOUT_MS,
    })
  })

  it("estimates without search when the search runs too long", async () => {
    const { calls, generate } = stub([
      () => reply("search"),
      () => timeout(),
      () => reply("unsure"),
    ])
    const r = await runGemini("Starbucks grande oat latte", "two-step", generate)
    expect(r).toMatchObject({ steps: 3, searchTimedOut: true, attribution: null })
    expect(calls[2]).toMatchObject({ system: ESTIMATE_PROMPT, search: false })
  })

  it("lets any other search failure through", async () => {
    const { generate } = stub([
      () => reply("search"),
      () => Object.assign(new Error("overloaded"), { status: 503 }),
    ])
    await expect(runGemini("Big Mac", "two-step", generate)).rejects.toThrow("overloaded")
  })
})

describe("failure reports", () => {
  const ctx = { ms: 812.4, final: false }

  it("blames Google for Gemini's own errors, seen by the function", () => {
    const report = describeGeminiError(
      // The shape of @google/genai's ApiError.
      Object.assign(new Error("overloaded"), { name: "ApiError", status: 503 }),
      ctx,
    )
    expect(report).toMatchObject({ code: "upstream", status: 503, ms: 812 })
    expect(classifyAiFailure(report)).toEqual({ blame: "google", kind: "unavailable" })
    expect(
      classifyAiFailure(describeGeminiError(new Error("socket hang up"), ctx)),
    ).toEqual({ blame: "google", kind: "unreachable" })
    expect(
      classifyAiFailure(
        describeGeminiError(Object.assign(new Error("aborted"), { name: "AbortError" }), ctx),
      ),
    ).toEqual({ blame: "google", kind: "timeout" })
  })

  it("classifies a callable failure the phone saw", () => {
    const phone = { model: "aiFill", ms: 100, final: false }
    const classify = (code: string, online = true) =>
      classifyAiFailure(
        sanitizeReport({
          ...describeAiError(new FunctionsError(code as never, "internal"), phone),
          online,
        }),
      )
    expect(classify("unauthenticated")).toEqual({ blame: "device", kind: "app-check" })
    expect(classify("not-found")).toEqual({ blame: "ours", kind: "config" })
    expect(classify("internal", false)).toEqual({ blame: "device", kind: "network" })
    expect(classify("internal")).toEqual({ blame: "ours", kind: "function-error" })
    expect(classify("deadline-exceeded")).toEqual({ blame: "google", kind: "timeout" })
  })
})

describe("shownFills", () => {
  const p = (cycleId: string, base: number, id = 1) => ({ id, cycleId, base })

  it("shows a tapped fill before the server's count arrives", () => {
    expect(shownFills([p("c1", 3)], "c1", 3)).toBe(4)
  })

  it("never counts a fill twice once the server's count is in", () => {
    expect(shownFills([p("c1", 3)], "c1", 4)).toBe(4)
  })

  it("ignores fills pending on another cycle", () => {
    expect(shownFills([p("c0", 9)], "c1", 2)).toBe(2)
    expect(shownFills([], "c1", 2)).toBe(2)
  })
})

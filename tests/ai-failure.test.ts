// Seam: a failed AI fill → whose problem it is (ADR 0014). The phone's report
// builder runs on real firebase/ai errors; the classifier and the window
// verdict are pure; the 15-minute health check runs against the emulator
// through the Admin SDK, exactly as the deployed function does.
import { deleteApp, initializeApp, type App } from "firebase-admin/app"
import {
  getFirestore,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore"
import { AIError } from "firebase/ai"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  classifyAiFailure,
  sanitizeReport,
  type AiFailureReport,
} from "../functions/src/ai-failure"
import {
  relevantIncidents,
  runAiHealthCheck,
  summarise,
  windowBefore,
  type FailureRow,
  type GoogleIncident,
} from "../functions/src/ai-health"
import { describeAiError, describeBadOutput } from "@/lib/ai-report"
import { clearFirestoreData } from "./emulator"

const ctx = { model: "gemini-test", ms: 1234.4, final: false }

function report(over: Partial<AiFailureReport>): AiFailureReport {
  return sanitizeReport({ code: "fetch-error", message: "", ...over })
}

function fetchError(status: number, message: string, reason?: string) {
  return new AIError(
    "fetch-error",
    `Error fetching from https://firebasevertexai.googleapis.com/…: [${status}] ${message}`,
    {
      status,
      statusText: "",
      errorDetails: reason ? [{ reason }] : undefined,
    }
  )
}

describe("describeAiError", () => {
  it("keeps an AIError's code, status, reason and timing", () => {
    const r = describeAiError(
      fetchError(429, "Quota exceeded", "RATE_LIMIT_EXCEEDED"),
      ctx
    )
    expect(r).toMatchObject({
      code: "fetch-error",
      status: 429,
      reason: "RATE_LIMIT_EXCEEDED",
      model: "gemini-test",
      ms: 1234,
      final: false,
    })
  })

  it("picks up the finish reason of a blocked reply", () => {
    const err = new AIError("response-error", "Candidate was blocked", {
      response: { candidates: [{ finishReason: "SAFETY" }] } as never,
    })
    expect(describeAiError(err, ctx)).toMatchObject({
      code: "response-error",
      finishReason: "SAFETY",
    })
  })

  it("names a plain JS error by its name", () => {
    const r = describeAiError(new TypeError("x is undefined"), ctx)
    expect(r.code).toBe("TypeError")
    expect(classifyAiFailure(r)).toEqual({ blame: "ours", kind: "app-crash" })
  })

  it("reports a reply outside the contract as ours", () => {
    const r = describeBadOutput("MAX_TOKENS", 812, ctx)
    expect(r.finishReason).toBe("MAX_TOKENS")
    expect(classifyAiFailure(r)).toEqual({ blame: "ours", kind: "bad-output" })
  })
})

describe("classifyAiFailure", () => {
  const cases: [string, Partial<AiFailureReport>, string, string][] = [
    ["503", { status: 503 }, "google", "unavailable"],
    ["500", { status: 500 }, "google", "server-error"],
    ["504", { status: 504 }, "google", "timeout"],
    ["SDK timeout", { code: "AbortError" }, "google", "timeout"],
    [
      "Vertex shared capacity",
      { status: 429, message: "Resource exhausted. Please try again later." },
      "google",
      "overloaded",
    ],
    [
      "AI Logic per-user limit",
      { status: 429, message: "Quota exceeded for quota metric 'per user'" },
      "ours",
      "quota",
    ],
    ["filters", { code: "response-error" }, "google", "blocked"],
    ["bad request", { status: 400 }, "ours", "bad-request"],
    ["retired model", { status: 404 }, "ours", "model-missing"],
    ["permission", { status: 403 }, "ours", "permission"],
    ["API off", { code: "api-not-enabled" }, "ours", "config"],
    ["App Check", { status: 401 }, "device", "app-check"],
    [
      "no connection",
      { code: "error", message: "Error fetching from …: Failed to fetch" },
      "device",
      "network",
    ],
    ["offline", { code: "error", online: false }, "device", "network"],
    [
      "stale deploy",
      {
        code: "TypeError",
        message: "Failed to fetch dynamically imported module",
      },
      "ours",
      "chunk-load",
    ],
    ["unrecognised", { code: "error", message: "?" }, "unknown", "error"],
  ]
  it.each(cases)("%s", (_, over, blame, kind) => {
    expect(classifyAiFailure(report(over))).toEqual({ blame, kind })
  })
})

describe("sanitizeReport", () => {
  it("trims junk to the report's shape", () => {
    const r = sanitizeReport({
      code: 7,
      status: "503",
      message: "x".repeat(5000),
      online: "yes",
      extra: "dropped",
    })
    expect(r).toEqual({
      code: "unknown",
      status: null,
      reason: null,
      finishReason: null,
      message: "x".repeat(400),
      model: "unknown",
      online: true,
      ms: null,
      final: false,
    })
  })
})

const W = {
  start: new Date("2026-11-02T10:00:00Z"),
  end: new Date("2026-11-02T10:15:00Z"),
}
const rows = (n: number, blame: FailureRow["blame"], kind: string, users = n) =>
  Array.from({ length: n }, (_, i) => ({ uid: `u${i % users}`, blame, kind }))

describe("summarise", () => {
  it("stays quiet for one phone's bad connection", () => {
    const s = summarise(rows(4, "device", "network", 1), W, [], [])
    expect(s.verdict).toBe("quiet")
    expect(s.alerts).toEqual([])
  })

  it("blames Google and names its incident", () => {
    const incident: GoogleIncident = {
      source: "cloud",
      title: "Elevated errors on Vertex Gemini API",
      url: "https://status.cloud.google.com/incidents/abc",
      begin: "2026-11-02T09:50:00Z",
      ongoing: true,
    }
    const s = summarise(
      rows(6, "google", "unavailable", 3),
      W,
      [incident],
      ["u1"]
    )
    expect(s.verdict).toBe("google")
    expect(s.alerts[0]).toContain("Elevated errors on Vertex Gemini API")
    expect(s.usersByBlame.google).toBe(3)
    expect(s.payingUids).toEqual(["u1"])
  })

  it("says when Google's status pages are still quiet", () => {
    const s = summarise(rows(10, "google", "unavailable", 1), W, [], [])
    expect(s.verdict).toBe("google")
    expect(s.alerts[0]).toContain("not on Google's status pages yet")
  })

  it("alerts on the first sighting of a retired model", () => {
    const s = summarise(rows(1, "ours", "model-missing"), W, [], [])
    expect(s.verdict).toBe("ours")
  })

  it("puts our side first when both fail", () => {
    const s = summarise(
      [...rows(5, "ours", "bad-output"), ...rows(10, "google", "unavailable")],
      W,
      [],
      []
    )
    expect(s.verdict).toBe("ours")
    expect(s.alerts).toHaveLength(2)
  })

  it("treats App Check refusing many phones as our setup", () => {
    const s = summarise(rows(5, "device", "app-check"), W, [], [])
    expect(s.verdict).toBe("ours")
    expect(s.alerts[0]).toContain("App Check")
  })
})

describe("relevantIncidents", () => {
  const since = new Date("2026-11-02T09:00:00Z")
  const feed = [
    {
      external_desc: "Vertex Gemini API elevated error rates",
      begin: "2026-11-02T09:30:00Z",
      end: null,
      uri: "incidents/abc",
      service_name: "Vertex Gemini API",
      affected_products: [{ title: "Vertex Gemini API" }],
    },
    {
      external_desc: "Old Gemini incident",
      begin: "2026-10-01T09:30:00Z",
      end: "2026-10-01T11:00:00Z",
      uri: "incidents/old",
      affected_products: [{ title: "Vertex Gemini API" }],
    },
    {
      external_desc: "Cloud SQL latency",
      begin: "2026-11-02T09:30:00Z",
      end: null,
      uri: "incidents/sql",
      affected_products: [{ title: "Cloud SQL" }],
    },
  ]
  it("keeps open or recent AI incidents only", () => {
    expect(relevantIncidents(feed, "cloud", since)).toEqual([
      {
        source: "cloud",
        title: "Vertex Gemini API elevated error rates",
        url: "https://status.cloud.google.com/incidents/abc",
        begin: "2026-11-02T09:30:00Z",
        ongoing: true,
      },
    ])
  })
  it("survives a feed it doesn't understand", () => {
    expect(relevantIncidents({ nope: true }, "firebase", since)).toEqual([])
  })
})

describe("windowBefore", () => {
  it("is the quarter hour that just ended", () => {
    expect(windowBefore(new Date("2026-11-02T10:15:00.400Z"))).toEqual(W)
  })
})

describe("runAiHealthCheck (emulator)", () => {
  let app: App
  let db: Firestore
  beforeAll(() => {
    app = initializeApp({ projectId: "goyaffle" }, "ai-health-test")
    db = getFirestore(app)
  })
  afterAll(async () => {
    await deleteApp(app)
  })
  beforeEach(async () => {
    await clearFirestoreData()
  })

  const fail = (uid: string, blame: string, kind: string, at: Date) =>
    db
      .collection("aiFailures")
      .add({ uid, blame, kind, at: Timestamp.fromDate(at) })

  it("writes nothing for a quiet window", async () => {
    expect(await runAiHealthCheck(db, W.end, async () => [])).toBeNull()
    expect((await db.collection("aiHealth").get()).size).toBe(0)
  })

  it("sums up the window, checks Google and finds paying users", async () => {
    const inside = new Date("2026-11-02T10:05:00Z")
    await Promise.all([
      fail("alice", "google", "unavailable", inside),
      fail("bob", "google", "unavailable", inside),
      fail("carol", "google", "unavailable", inside),
      // Outside the window: before and at its end.
      fail("dave", "ours", "bad-request", new Date("2026-11-02T09:59:59Z")),
      fail("dave", "ours", "bad-request", W.end),
      db.doc("users/alice/settings/subscription").set({
        plan: "pro",
        billing: "monthly",
        status: "active",
        provider: "paddle",
        customerId: "ctm_1",
        subscriptionId: "sub_1",
        planStartedAt: Timestamp.fromDate(new Date("2026-10-20T00:00:00Z")),
        currentPeriodEnd: null,
        cancelsAt: null,
        eventAt: Timestamp.fromDate(new Date("2026-10-20T00:00:00Z")),
      }),
    ])
    let asked: Date | null = null
    const summary = await runAiHealthCheck(db, W.end, async (since) => {
      asked = since
      return []
    })
    expect(asked).not.toBeNull()
    expect(summary).toMatchObject({
      failures: 3,
      verdict: "google",
      usersByBlame: { google: 3 },
      payingUids: ["alice"],
    })
    const doc = await db.doc(`aiHealth/${W.start.toISOString()}`).get()
    expect(doc.data()?.verdict).toBe("google")
  })

  it("doesn't look Google up when only our side failed", async () => {
    await fail(
      "alice",
      "ours",
      "model-missing",
      new Date("2026-11-02T10:01:00Z")
    )
    let asked = false
    const summary = await runAiHealthCheck(db, W.end, async () => {
      asked = true
      return []
    })
    expect(asked).toBe(false)
    expect(summary?.verdict).toBe("ours")
  })
})

import { Timestamp, type Firestore } from "firebase-admin/firestore"

import type { Blame } from "./ai-failure.js"
import { isEntitling } from "./entitlement.js"
import { entitlementRef, fromDoc } from "./webhook.js"

// The 15-minute AI fill health check (ADR 0014). It reads the failures the
// phones reported in the window that just ended, decides whether they add up
// to something someone has to look at, and — when Google is to blame — checks
// Google's own status pages for a matching incident. One /aiHealth doc per
// window that had any failure; quiet windows write nothing. Both collections
// expire after 90 days (Firestore TTL on expireAt; privacy policy § 6).

export const WINDOW_MS = 15 * 60_000

/** The log line Cloud Monitoring's alert policy matches (runbook). */
export const ALERT_MESSAGE = "AI fill alert"

// Small on purpose: at launch there are few users, so an outage shows up as
// a handful of failures, not hundreds. A definite configuration fault alerts
// on its first sighting.
export const THRESHOLDS = {
  ours: { users: 2, failures: 5 },
  google: { users: 3, failures: 10 },
  unknown: { users: 2, failures: 5 },
  // App Check refusing one phone is normal (ad blockers); refusing many at
  // once means our App Check / reCAPTCHA setup broke.
  appCheckUsers: 5,
} as const
const ALERT_AT_ONCE = new Set(["config", "model-missing", "permission"])

export interface FailureRow {
  uid: string
  blame: Blame
  kind: string
}

export interface GoogleIncident {
  source: "cloud" | "firebase"
  title: string
  url: string
  begin: string
  ongoing: boolean
}

export type Verdict = "quiet" | "ours" | "google" | "unknown"

export interface WindowSummary {
  start: Date
  end: Date
  failures: number
  /** Failures per blame, and per "blame/kind". */
  byBlame: Partial<Record<Blame, number>>
  byKind: Record<string, number>
  /** Distinct users per blame. */
  usersByBlame: Partial<Record<Blame, number>>
  /** The verdict: who has to act, or "quiet" when nobody does. */
  verdict: Verdict
  /** One plain sentence per reason the window alerted. */
  alerts: string[]
  googleIncidents: GoogleIncident[]
  /** Users on a paid plan who hit a failure — for any goodwill credit. */
  payingUids: string[]
}

/** The window that ended at the last quarter hour before `now`. */
export function windowBefore(now: Date): { start: Date; end: Date } {
  const end = Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS
  return { start: new Date(end - WINDOW_MS), end: new Date(end) }
}

export function summarise(
  rows: FailureRow[],
  window: { start: Date; end: Date },
  googleIncidents: GoogleIncident[],
  payingUids: string[]
): WindowSummary {
  const byBlame: Partial<Record<Blame, number>> = {}
  const byKind: Record<string, number> = {}
  const users: Partial<Record<Blame, Set<string>>> = {}
  const appCheckUsers = new Set<string>()
  const atOnce = new Set<string>()
  for (const r of rows) {
    byBlame[r.blame] = (byBlame[r.blame] ?? 0) + 1
    const k = `${r.blame}/${r.kind}`
    byKind[k] = (byKind[k] ?? 0) + 1
    ;(users[r.blame] ??= new Set()).add(r.uid)
    if (r.kind === "app-check") appCheckUsers.add(r.uid)
    if (r.blame === "ours" && ALERT_AT_ONCE.has(r.kind)) atOnce.add(r.kind)
  }
  const usersByBlame: Partial<Record<Blame, number>> = {}
  for (const [b, set] of Object.entries(users)) {
    usersByBlame[b as Blame] = set.size
  }

  const over = (b: "ours" | "google" | "unknown") =>
    (usersByBlame[b] ?? 0) >= THRESHOLDS[b].users ||
    (byBlame[b] ?? 0) >= THRESHOLDS[b].failures

  const alerts: string[] = []
  let ours = false
  if (atOnce.size > 0) {
    ours = true
    alerts.push(
      `Our setup is refusing AI fills (${[...atOnce].join(", ")}): fix needed.`
    )
  } else if (over("ours")) {
    ours = true
    alerts.push(
      `${byBlame.ours} fills failed on our side for ${usersByBlame.ours} users: fix needed.`
    )
  }
  if (appCheckUsers.size >= THRESHOLDS.appCheckUsers) {
    ours = true
    alerts.push(
      `App Check refused ${appCheckUsers.size} users: check the App Check and reCAPTCHA setup.`
    )
  }
  const google = over("google")
  if (google) {
    alerts.push(
      googleIncidents.length > 0
        ? `${byBlame.google} fills failed on Google's side; Google reports: ${googleIncidents
            .map((i) => i.title)
            .join("; ")}.`
        : `${byBlame.google} fills failed on Google's side for ${usersByBlame.google} users; not on Google's status pages yet.`
    )
  }
  const unknown = over("unknown")
  if (unknown) {
    alerts.push(
      `${byBlame.unknown} fills failed in a way we don't recognise yet: read the messages in /aiFailures.`
    )
  }

  // When both sides fail, ours wins the verdict: it's the one we can act on.
  const verdict: Verdict = ours
    ? "ours"
    : google
      ? "google"
      : unknown
        ? "unknown"
        : "quiet"

  return {
    ...window,
    failures: rows.length,
    byBlame,
    byKind,
    usersByBlame,
    verdict,
    alerts,
    googleIncidents,
    payingUids,
  }
}

const AI_PRODUCTS = /gemini|vertex ai|ai logic|generative ai/i

/**
 * The incidents on a Google status feed (status.cloud.google.com or
 * status.firebase.google.com, incidents.json) that touch Gemini / Vertex AI /
 * Firebase AI Logic and were open at any point since `since`.
 */
export function relevantIncidents(
  feed: unknown,
  source: GoogleIncident["source"],
  since: Date
): GoogleIncident[] {
  if (!Array.isArray(feed)) return []
  const base =
    source === "cloud"
      ? "https://status.cloud.google.com/"
      : "https://status.firebase.google.com/"
  const out: GoogleIncident[] = []
  for (const raw of feed) {
    if (typeof raw !== "object" || raw === null) continue
    const i = raw as Record<string, unknown>
    const end = typeof i.end === "string" ? new Date(i.end) : null
    if (end && end < since) continue
    const products = Array.isArray(i.affected_products)
      ? (i.affected_products as { title?: unknown }[])
          .map((p) => (typeof p.title === "string" ? p.title : ""))
          .join(" ")
      : ""
    const service = typeof i.service_name === "string" ? i.service_name : ""
    if (!AI_PRODUCTS.test(`${service} ${products}`)) continue
    const desc =
      typeof i.external_desc === "string" ? i.external_desc.trim() : ""
    out.push({
      source,
      title: (desc || service || "Incident").slice(0, 200),
      url: typeof i.uri === "string" ? base + i.uri.replace(/^\//, "") : base,
      begin: typeof i.begin === "string" ? i.begin : "",
      ongoing: end === null,
    })
  }
  return out
}

const FEEDS: [GoogleIncident["source"], string][] = [
  ["cloud", "https://status.cloud.google.com/incidents.json"],
  ["firebase", "https://status.firebase.google.com/incidents.json"],
]

/** Both status feeds; a feed that doesn't answer in time counts as empty. */
export async function fetchGoogleIncidents(
  since: Date
): Promise<GoogleIncident[]> {
  const lists = await Promise.all(
    FEEDS.map(async ([source, url]) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return []
        return relevantIncidents(await res.json(), source, since)
      } catch {
        return []
      }
    })
  )
  return lists.flat()
}

// Bounds the entitlement reads per window; a window this bad alerts anyway.
const MAX_ENTITLEMENT_READS = 100

/**
 * Check the window before `now` and record it. Returns null for a window
 * without failures.
 */
export async function runAiHealthCheck(
  db: Firestore,
  now: Date,
  incidents: (since: Date) => Promise<GoogleIncident[]> = fetchGoogleIncidents
): Promise<WindowSummary | null> {
  const window = windowBefore(now)
  const snap = await db
    .collection("aiFailures")
    .where("at", ">=", Timestamp.fromDate(window.start))
    .where("at", "<", Timestamp.fromDate(window.end))
    .get()
  if (snap.empty) return null
  const rows: FailureRow[] = snap.docs.map((d) => {
    const v = d.data()
    return {
      uid: String(v.uid),
      blame: v.blame as Blame,
      kind: String(v.kind),
    }
  })

  // Look Google up only when the window points at Google (or at nothing we
  // recognise): the feeds are large, and a quiet window needs no answer.
  const pointsAtGoogle = rows.some(
    (r) => r.blame === "google" || r.blame === "unknown"
  )
  const googleIncidents = pointsAtGoogle
    ? await incidents(new Date(window.start.getTime() - 60 * 60_000))
    : []

  const uids = [...new Set(rows.map((r) => r.uid))].slice(
    0,
    MAX_ENTITLEMENT_READS
  )
  const docs = uids.length
    ? await db.getAll(...uids.map((uid) => entitlementRef(db, uid)))
    : []
  const payingUids = docs.flatMap((doc, i) => {
    const e = fromDoc(doc.data())
    return e && e.plan !== "free" && isEntitling(e.status) ? [uids[i]] : []
  })

  const summary = summarise(rows, window, googleIncidents, payingUids)
  await db.doc(`aiHealth/${window.start.toISOString()}`).set({
    ...summary,
    start: Timestamp.fromDate(summary.start),
    end: Timestamp.fromDate(summary.end),
    expireAt: Timestamp.fromMillis(summary.end.getTime() + 90 * 86_400_000),
  })
  return summary
}

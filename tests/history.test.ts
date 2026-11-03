// Seam: the full Entry history without a full re-read on every launch (ADR
// 0017). The last RECENT_DAYS Days are a live listener; older Days come from
// the phone's cache and are refreshed from the server now and then. Runs
// against the emulator, with "another device" played by the Admin SDK.
import { deleteApp, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  historyCutoff,
  listenToAllEntries,
  needsRefresh,
  RECENT_DAYS,
  REFRESH_DAYS,
  type Entry,
} from "@/data/entries"
import { ensureIdentity } from "@/data/identity"
import { localDay } from "@/lib/day"
import {
  clearFirestoreData,
  createEmulatorApp,
  destroyEmulatorApp,
  waitFor,
  type EmulatorApp,
} from "./emulator"

const DAY_MS = 86_400_000

describe("history cutoff and refresh rule", () => {
  it("covers the last RECENT_DAYS Days live", () => {
    const now = new Date(2026, 10, 3, 12)
    expect(historyCutoff(now)).toBe(localDay(new Date(now.getTime() - RECENT_DAYS * DAY_MS)))
  })

  it("refreshes on a new device, once a week, and when the cache lost Entries", () => {
    const now = Date.parse("2026-11-03T12:00:00Z")
    expect(needsRefresh(null, 0, now)).toBe(true)
    expect(needsRefresh({ at: now - DAY_MS, count: 40 }, 40, now)).toBe(false)
    expect(needsRefresh({ at: now - DAY_MS, count: 40 }, 55, now)).toBe(false)
    expect(needsRefresh({ at: now - REFRESH_DAYS * DAY_MS, count: 40 }, 40, now)).toBe(true)
    expect(needsRefresh({ at: now - DAY_MS, count: 40 }, 12, now)).toBe(true)
  })
})

describe("listenToAllEntries", () => {
  let ctx: EmulatorApp
  let uid: string
  let adminApp: App
  let admin: Firestore
  const stops: (() => void)[] = []
  const oldDay = localDay(new Date(Date.now() - (RECENT_DAYS + 30) * DAY_MS))
  const today = localDay(new Date())

  beforeAll(() => {
    adminApp = initializeApp({ projectId: "goyaffle" }, "history-test")
    admin = getFirestore(adminApp)
  })

  afterAll(async () => {
    await deleteApp(adminApp)
  })

  beforeEach(async () => {
    try {
      globalThis.localStorage?.clear()
    } catch {
      // No storage in this runtime: every listen refreshes.
    }
    ctx = createEmulatorApp()
    uid = (await ensureIdentity(ctx.auth)).uid
  })

  afterEach(async () => {
    stops.splice(0).forEach((stop) => stop())
    await destroyEmulatorApp(ctx)
    await clearFirestoreData()
  })

  const elsewhere = (id: string, date: string, label: string) =>
    admin.doc(`users/${uid}/entries/${id}`).set({
      date,
      label,
      kcal: 100,
      mealType: "unknown",
      source: "manual",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })

  const listen = () => {
    const states: Entry[][] = []
    stops.push(listenToAllEntries(ctx.db, uid, (entries) => states.push(entries)))
    return states
  }

  const labels = (entries: Entry[]) => entries.map((e) => e.label).sort()

  it("joins old and recent Entries logged on another device", async () => {
    await elsewhere("old1", oldDay, "old")
    await elsewhere("new1", today, "new")
    const states = listen()
    const all = await waitFor(() => states.find((s) => s.length === 2))
    expect(labels(all)).toEqual(["new", "old"])
  })

  it("keeps recent Days live", async () => {
    const states = listen()
    await waitFor(() => states.at(-1))
    await elsewhere("new2", today, "from the other phone")
    const next = await waitFor(() => states.find((s) => s.length === 1))
    expect(labels(next)).toEqual(["from the other phone"])
  })

  it("drops an old Entry deleted elsewhere at the next refresh", async () => {
    await elsewhere("old2", oldDay, "deleted later")
    const first = listen()
    await waitFor(() => first.find((s) => s.length === 1))
    stops.splice(0).forEach((stop) => stop())

    await admin.doc(`users/${uid}/entries/old2`).delete()
    const second = listen()
    await waitFor(() => {
      const latest = second.at(-1)
      return latest && latest.length === 0 ? latest : undefined
    })
  })
})

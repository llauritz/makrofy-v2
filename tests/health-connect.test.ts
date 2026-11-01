// Seam: the Health Connect runner and preferences (ADR 0014). The runner
// follows a profile's Entries in the emulator and hands its writes to a fake
// sink standing in for the native plugin.
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { addEntry, deleteEntry, updateEntry } from "@/data/entries"
import {
  readHealthPrefs,
  startNutritionSync,
  type HealthStore,
  type NutritionSink,
} from "@/data/health-connect"
import { ensureIdentity } from "@/data/identity"
import { localDay } from "@/lib/day"
import type { NutritionRecordInput } from "@/lib/health-sync"
import { HealthConnectError } from "@/native/health-connect"
import {
  clearFirestoreData,
  createEmulatorApp,
  destroyEmulatorApp,
  waitFor,
  type EmulatorApp,
} from "./emulator"

function fakeStore(initial: Record<string, string> = {}): HealthStore {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

function recordingSink() {
  const upserts: NutritionRecordInput[] = []
  const deletes: string[] = []
  const sink: NutritionSink = {
    upsert: async (records) => void upserts.push(...records),
    remove: async (ids) => void deletes.push(...ids),
  }
  return { sink, upserts, deletes }
}

describe("readHealthPrefs", () => {
  it("defaults everything off", () => {
    expect(readHealthPrefs(fakeStore())).toEqual({
      writeFood: false,
      writeSinceMs: 0,
      readWeight: false,
      revoked: [],
    })
  })

  it("reads corrupt storage as the defaults", () => {
    expect(
      readHealthPrefs(fakeStore({ "yaffle:health-connect:v1": "{not json" }))
        .writeFood
    ).toBe(false)
  })
})

describe("startNutritionSync", () => {
  let ctx: EmulatorApp
  let uid: string
  let stop: (() => void) | undefined

  beforeEach(async () => {
    await clearFirestoreData()
    ctx = createEmulatorApp()
    uid = (await ensureIdentity(ctx.auth)).uid
  })

  afterEach(async () => {
    stop?.()
    stop = undefined
    await destroyEmulatorApp(ctx)
  })

  const today = () => localDay(new Date())

  it("sends new Entries, follows edits, and removes deleted ones", async () => {
    const { sink, upserts, deletes } = recordingSink()
    stop = startNutritionSync(ctx.db, uid, {
      sinceMs: Date.now() - 1000,
      onRevoked: () => {},
      sink,
      store: fakeStore(),
      settleMs: 20,
    })

    const id = addEntry(ctx.db, uid, {
      date: today(),
      label: "Toast",
      kcal: 180,
      source: "manual",
    })
    const first = await waitFor(() =>
      upserts.find((r) => r.clientRecordId === id)
    )
    expect(first.kcal).toBe(180)

    updateEntry(ctx.db, uid, id, { label: "Toast", kcal: 240, protein: 7 })
    const edited = await waitFor(() => upserts.find((r) => r.kcal === 240))
    expect(edited).toMatchObject({ clientRecordId: id, protein: 7 })

    deleteEntry(ctx.db, uid, id)
    await waitFor(() => (deletes.includes(id) ? true : undefined))
  })

  it("leaves Entries from before the toggle alone", async () => {
    const before = addEntry(ctx.db, uid, {
      date: today(),
      label: "Old",
      kcal: 90,
      source: "manual",
    })
    await new Promise((r) => setTimeout(r, 50))
    const { sink, upserts } = recordingSink()
    stop = startNutritionSync(ctx.db, uid, {
      sinceMs: Date.now() + 5_000,
      onRevoked: () => {},
      sink,
      store: fakeStore(),
      settleMs: 20,
    })
    await new Promise((r) => setTimeout(r, 500))
    expect(upserts.find((r) => r.clientRecordId === before)).toBeUndefined()
  })

  it("stops and reports when the permission was revoked", async () => {
    let revoked = false
    const sink: NutritionSink = {
      upsert: async () => {
        throw new HealthConnectError("permission", "revoked")
      },
      remove: async () => {},
    }
    stop = startNutritionSync(ctx.db, uid, {
      sinceMs: 0,
      onRevoked: () => (revoked = true),
      sink,
      store: fakeStore(),
      settleMs: 20,
    })
    addEntry(ctx.db, uid, {
      date: today(),
      label: "Apple",
      kcal: 80,
      source: "manual",
    })
    await waitFor(() => (revoked ? true : undefined))
  })
})

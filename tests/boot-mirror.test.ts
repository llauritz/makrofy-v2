// Seam: the boot mirror (issue #69) — the last-rendered launch state kept in
// localStorage so a returning launch paints instantly instead of waiting for
// Firebase Auth's blocking server round-trip (Firestore holds even cached
// snapshots until auth settles). The mirror is a plain read/write pair: the
// data hooks seed from readBootMirror, startBootMirror follows auth and the
// live listeners to keep it fresh.
import { afterEach, describe, expect, it } from "vitest"

import {
  readBootMirror,
  startBootMirror,
  type MirrorStore,
} from "@/data/boot-mirror"
import { addEntry } from "@/data/entries"
import { setGoal } from "@/data/goal"
import { ensureIdentity, signOutToGuest } from "@/data/identity"
import { localDay } from "@/lib/day"
import {
  clearFirestoreData,
  createEmulatorApp,
  destroyEmulatorApp,
  waitFor,
  type EmulatorApp,
} from "./emulator"

function fakeStore(initial: Record<string, string> = {}): MirrorStore {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

describe("readBootMirror", () => {
  it("returns null when nothing has been mirrored yet", () => {
    expect(readBootMirror(fakeStore())).toBeNull()
  })

  it("returns null for a corrupt mirror rather than throwing", () => {
    expect(
      readBootMirror(fakeStore({ "yaffle:boot-mirror:v1": "not json {" })),
    ).toBeNull()
  })

  it("returns null when storage is unavailable", () => {
    expect(readBootMirror(null)).toBeNull()
  })
})

describe("startBootMirror", () => {
  let ctx: EmulatorApp
  let stop: (() => void) | undefined

  afterEach(async () => {
    stop?.()
    stop = undefined
    if (ctx) await destroyEmulatorApp(ctx)
    await clearFirestoreData()
  })

  it("mirrors the identity, Goal and today's Entries as they change", async () => {
    ctx = createEmulatorApp()
    const store = fakeStore()
    stop = startBootMirror(ctx.auth, ctx.db, store)

    const user = await ensureIdentity(ctx.auth)
    await waitFor(() =>
      readBootMirror(store)?.uid === user.uid ? true : undefined,
    )

    setGoal(ctx.db, user.uid, { kcal: 2100, protein: 130 })
    await waitFor(() =>
      readBootMirror(store)?.goal?.kcal === 2100 ? true : undefined,
    )

    const today = localDay(new Date())
    addEntry(ctx.db, user.uid, {
      date: today,
      label: "porridge",
      kcal: 350,
      source: "manual",
    })
    const mirror = await waitFor(() => {
      const m = readBootMirror(store)
      return m && m.entries.length === 1 ? m : undefined
    })
    expect(mirror.day).toBe(today)
    expect(mirror.goal).toEqual({ kcal: 2100, protein: 130 })
    expect(mirror.entries[0].label).toBe("porridge")
    expect(mirror.entries[0].kcal).toBe(350)
    // Timestamps must survive the JSON round-trip as live Timestamps.
    expect(mirror.entries[0].createdAt.toMillis()).toBeGreaterThan(0)
  })

  it("resets the mirrored data when the identity changes", async () => {
    ctx = createEmulatorApp()
    const store = fakeStore()
    stop = startBootMirror(ctx.auth, ctx.db, store)

    const first = await ensureIdentity(ctx.auth)
    setGoal(ctx.db, first.uid, { kcal: 1800 })
    addEntry(ctx.db, first.uid, {
      date: localDay(new Date()),
      label: "toast",
      kcal: 200,
      source: "manual",
    })
    await waitFor(() => {
      const m = readBootMirror(store)
      return m && m.goal !== null && m.entries.length === 1 ? true : undefined
    })

    // Sign-out mints a fresh Guest: the mirror must follow the new uid and
    // drop the old profile's data rather than seed it into the next launch.
    const second = await signOutToGuest(ctx.auth)
    expect(second.uid).not.toBe(first.uid)
    await waitFor(() =>
      readBootMirror(store)?.uid === second.uid ? true : undefined,
    )
    const mirror = readBootMirror(store)
    expect(mirror?.goal).toBeNull()
    expect(mirror?.entries).toEqual([])
  })
})

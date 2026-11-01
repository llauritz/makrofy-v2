// Seam: the boot mirror (issue #69) — the last-rendered launch state kept in
// localStorage so a returning launch paints instantly instead of waiting for
// Firebase Auth's blocking server round-trip (Firestore holds even cached
// snapshots until auth settles). The mirror is a plain read/write pair: the
// data hooks seed from readBootMirror, startBootMirror follows auth and the
// live listeners to keep it fresh.
import {
  collection,
  doc,
  query,
  waitForPendingWrites,
  where,
  type Firestore,
} from "firebase/firestore"
import { afterEach, describe, expect, it } from "vitest"

import {
  readBootMirror,
  startBootMirror,
  type MirrorStore,
} from "@/data/boot-mirror"
import { setCoverage } from "@/data/days"
import { addEntry } from "@/data/entries"
import { setGoal } from "@/data/goal"
import { ensureIdentity, signOutToGuest } from "@/data/identity"
import { localDay, stepDay } from "@/lib/day"
import {
  clearFirestoreData,
  createEmulatorApp,
  destroyEmulatorApp,
  serverCurrent,
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

// Every target the mirror listens on for `uid` today, server-confirmed — so a
// test's writes never race the mirror's listeners still being added (see
// serverCurrent). The queries mirror boot-mirror.ts's listeners exactly, so
// they share its server targets.
async function mirrorListening(db: Firestore, uid: string): Promise<void> {
  const day = localDay(new Date())
  const entries = collection(db, "users", uid, "entries")
  await Promise.all([
    serverCurrent(doc(db, "users", uid, "settings", "goal")),
    serverCurrent(entries),
    serverCurrent(query(entries, where("date", "==", day))),
    serverCurrent(doc(db, "users", uid, "days", day)),
  ])
}

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
    await mirrorListening(ctx.db, user.uid)

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
    await waitFor(() =>
      readBootMirror(store)?.uid === first.uid ? true : undefined,
    )
    await mirrorListening(ctx.db, first.uid)
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

  it("mirrors the logged-day dots and today's Coverage label", async () => {
    ctx = createEmulatorApp()
    const store = fakeStore()
    stop = startBootMirror(ctx.auth, ctx.db, store)
    const user = await ensureIdentity(ctx.auth)
    await waitFor(() =>
      readBootMirror(store)?.uid === user.uid ? true : undefined,
    )
    await mirrorListening(ctx.db, user.uid)
    const today = localDay(new Date())
    const earlier = stepDay(today, -3)

    for (const date of [earlier, today]) {
      addEntry(ctx.db, user.uid, { date, label: "tea", kcal: 5, source: "manual" })
    }
    setCoverage(ctx.db, user.uid, today, "most")
    const mirror = await waitFor(() => {
      const m = readBootMirror(store)
      return m?.loggedDays?.length === 2 && m.coverage === "most" ? m : undefined
    })
    expect(mirror.loggedDays).toEqual([earlier, today])
  })

  it("adopts the stored mirror for the same uid instead of resetting it", async () => {
    ctx = createEmulatorApp()
    const user = await ensureIdentity(ctx.auth)
    setGoal(ctx.db, user.uid, { kcal: 1900 })
    // Acknowledged before the mirror's listeners start, so they can't race it
    // (see serverCurrent).
    await waitForPendingWrites(ctx.db)
    // A previous launch's mirror for this very uid.
    const store = fakeStore({
      "yaffle:boot-mirror:v1": JSON.stringify({
        uid: user.uid,
        goal: { kcal: 1900 },
        day: localDay(new Date()),
        entries: [],
      }),
    })
    const writes: string[] = []
    stop = startBootMirror(ctx.auth, ctx.db, {
      getItem: (k) => store.getItem(k),
      setItem: (k, v) => {
        writes.push(v)
        store.setItem(k, v)
      },
    })
    await waitFor(() =>
      readBootMirror(store)?.loggedDays !== undefined ? true : undefined,
    )
    // Resetting would have written goal: null first — a hook mounting later in
    // the launch would then have seeded an unset Goal.
    expect(writes.length).toBeGreaterThan(0)
    for (const w of writes) expect(JSON.parse(w).goal).toEqual({ kcal: 1900 })
  })

  it("follows today across midnight", async () => {
    ctx = createEmulatorApp()
    const store = fakeStore()
    const user = await ensureIdentity(ctx.auth)
    // A clock parked 2 s before midnight: the mirror starts on that Day and
    // must move itself onto the next one when it arrives.
    const base = new Date()
    const offset =
      new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1).getTime() -
      2_000 -
      base.getTime()
    const clock = () => new Date(Date.now() + offset)
    const first = localDay(clock())
    const next = stepDay(first, 1)
    stop = startBootMirror(ctx.auth, ctx.db, store, clock)
    await waitFor(() => (readBootMirror(store)?.day === first ? true : undefined))

    addEntry(ctx.db, user.uid, { date: next, label: "late snack", kcal: 90, source: "manual" })
    const mirror = await waitFor(() => {
      const m = readBootMirror(store)
      return m?.day === next && m.entries.length === 1 ? m : undefined
    }, 8_000)
    expect(mirror.entries[0].label).toBe("late snack")
  })
})

// Seam: the identity module (ADR 0002, spec § Identity). A Guest is a silent
// anonymous user; Google sign-in *links* onto that same UID; a second-device
// collision triggers an automatic, promptless union merge (guest Entries copied
// into the existing account, existing settings kept); sign-out returns a fresh
// Guest. Exercised against the Auth + Firestore emulators — Google credentials
// are minted from claim JSON, which the Auth emulator accepts unsigned.
import { afterEach, describe, expect, it } from "vitest"
import {
  GoogleAuthProvider,
  linkWithCredential,
  signInWithCredential,
} from "firebase/auth"
import { doc, getDoc, waitForPendingWrites } from "firebase/firestore"
import { readAllDays, setCoverage } from "@/data/days"
import { addEntry, readAllEntries } from "@/data/entries"
import { setGoal } from "@/data/goal"
import { readAllOverlays, setPin } from "@/data/products"
import {
  ensureIdentity,
  isCredentialInUseError,
  signOutToGuest,
  unionMergeInto,
} from "@/data/identity"
import {
  clearFirestoreData,
  createEmulatorApp,
  destroyEmulatorApp,
  waitFor,
  type EmulatorApp,
} from "./emulator"

// The second device's Google account — same `sub` across the test means the
// same Firebase account, so a link attempt from a Guest collides with it.
const SECOND_DEVICE =
  '{"sub":"google-second-device","email":"user@example.com","email_verified":true}'
const googleCred = (claims = SECOND_DEVICE) =>
  GoogleAuthProvider.credential(claims)

async function readGoalKcal(
  ctx: EmulatorApp,
  uid: string
): Promise<number | undefined> {
  const snap = await getDoc(doc(ctx.db, "users", uid, "settings", "goal"))
  return snap.exists() ? (snap.data() as { kcal: number }).kcal : undefined
}

describe("ensureIdentity", () => {
  let ctx: EmulatorApp

  afterEach(async () => {
    if (ctx) await destroyEmulatorApp(ctx)
  })

  it("mints a Guest identity when the app opens signed out", async () => {
    ctx = createEmulatorApp()
    const user = await ensureIdentity(ctx.auth)
    expect(user.isAnonymous).toBe(true)
    expect(user.uid).toBeTruthy()
    expect(ctx.auth.currentUser?.uid).toBe(user.uid)
  })

  it("returns the existing identity instead of minting a second one", async () => {
    ctx = createEmulatorApp()
    const first = await ensureIdentity(ctx.auth)
    const second = await ensureIdentity(ctx.auth)
    expect(second.uid).toBe(first.uid)
  })
})

describe("signOutToGuest", () => {
  let ctx: EmulatorApp

  afterEach(async () => {
    if (ctx) await destroyEmulatorApp(ctx)
  })

  it("signs out and returns a fresh, different Guest", async () => {
    ctx = createEmulatorApp()
    const first = await ensureIdentity(ctx.auth)
    const second = await signOutToGuest(ctx.auth)
    expect(second.isAnonymous).toBe(true)
    expect(second.uid).not.toBe(first.uid)
    expect(ctx.auth.currentUser?.uid).toBe(second.uid)
  })
})

describe("Google sign-in — linking onto the same UID", () => {
  let ctx: EmulatorApp

  afterEach(async () => {
    if (ctx) await destroyEmulatorApp(ctx)
  })

  it("links onto the same Guest UID with nothing copied, when the account is new", async () => {
    await clearFirestoreData()
    ctx = createEmulatorApp()
    const guest = await ensureIdentity(ctx.auth)
    addEntry(ctx.db, guest.uid, {
      date: "2026-07-11",
      label: "eggs",
      kcal: 180,
      source: "manual",
    })
    await waitForPendingWrites(ctx.db)

    const linked = await linkWithCredential(
      ctx.auth.currentUser!,
      googleCred(
        '{"sub":"solo-user","email":"solo@example.com","email_verified":true}'
      )
    )

    // Same UID — the Guest's data is already in place, nothing moved.
    expect(linked.user.uid).toBe(guest.uid)
    expect(linked.user.isAnonymous).toBe(false)
    const entries = await readAllEntries(ctx.db, guest.uid)
    expect(entries.map((e) => e.label)).toEqual(["eggs"])
  })
})

describe("Google sign-in — second-device collision, union merge", () => {
  let existingApp: EmulatorApp
  let guestApp: EmulatorApp

  afterEach(async () => {
    if (existingApp) await destroyEmulatorApp(existingApp)
    if (guestApp) await destroyEmulatorApp(guestApp)
  })

  // First device: a Google account already holding Entries and a Goal.
  async function seedExistingAccount(labels: string[], goalKcal: number) {
    existingApp = createEmulatorApp()
    const existing = (
      await signInWithCredential(existingApp.auth, googleCred())
    ).user
    for (const label of labels) {
      addEntry(existingApp.db, existing.uid, {
        date: "2026-07-10",
        label,
        kcal: 300,
        source: "manual",
      })
    }
    setGoal(existingApp.db, existing.uid, { kcal: goalKcal })
    await waitForPendingWrites(existingApp.db)
    return existing.uid
  }

  // Second device: a fresh Guest that has logged something of its own.
  async function seedGuest(labels: string[], goalKcal: number) {
    guestApp = createEmulatorApp()
    const guest = await ensureIdentity(guestApp.auth)
    for (const label of labels) {
      addEntry(guestApp.db, guest.uid, {
        date: "2026-07-11",
        label,
        kcal: 150,
        source: "manual",
      })
    }
    setGoal(guestApp.db, guest.uid, { kcal: goalKcal })
    await waitForPendingWrites(guestApp.db)
    return guest.uid
  }

  it("merges the Guest's Entries in, keeps the existing settings, loses nothing", async () => {
    await clearFirestoreData()
    const existingUid = await seedExistingAccount(["oats", "apple"], 2222)
    const guestUid = await seedGuest(["toast"], 1500)

    const outcome = await unionMergeInto(
      guestApp.auth,
      guestApp.db,
      googleCred(),
      guestUid
    )

    // Signed into the existing account; one Guest Entry carried over.
    expect(outcome).toEqual({ uid: existingUid, merged: 1 })
    expect(guestApp.auth.currentUser?.uid).toBe(existingUid)

    // Both Entry sets present — no data loss.
    const merged = await readAllEntries(guestApp.db, existingUid)
    expect(merged.map((e) => e.label).sort()).toEqual([
      "apple",
      "oats",
      "toast",
    ])

    // Existing settings win: the Guest's 1500 goal is discarded.
    expect(await readGoalKcal(guestApp, existingUid)).toBe(2222)
  })

  it("unions the curation overlay too, the existing account winning per key", async () => {
    await clearFirestoreData()
    const existingUid = await seedExistingAccount(["oats"], 2000)
    // The existing account has already pinned count:oats.
    setPin(existingApp.db, existingUid, "count:oats", 380)
    await waitForPendingWrites(existingApp.db)

    const guestUid = await seedGuest([], 2000)
    // The Guest disagrees on count:oats and has a unique opinion on count:egg.
    setPin(guestApp.db, guestUid, "count:oats", 999)
    setPin(guestApp.db, guestUid, "count:egg", 78)
    await waitForPendingWrites(guestApp.db)

    await unionMergeInto(guestApp.auth, guestApp.db, googleCred(), guestUid)

    const overlays = await readAllOverlays(guestApp.db, existingUid)
    const byKey = new Map(overlays.map((o) => [o.key, o]))
    // Conflict: the existing account's pin stands; the Guest's unique one lands.
    expect(byKey.get("count:oats")?.pinnedRate).toBe(380)
    expect(byKey.get("count:egg")?.pinnedRate).toBe(78)
  })

  it("unions Coverage labels too, the existing account winning per date", async () => {
    await clearFirestoreData()
    const existingUid = await seedExistingAccount(["oats"], 2000)
    // The existing account has already labelled 2026-07-10.
    setCoverage(existingApp.db, existingUid, "2026-07-10", "everything")
    await waitForPendingWrites(existingApp.db)

    const guestUid = await seedGuest([], 2000)
    // The Guest disagrees on 2026-07-10 and has a unique label on 2026-07-11.
    setCoverage(guestApp.db, guestUid, "2026-07-10", "some")
    setCoverage(guestApp.db, guestUid, "2026-07-11", "most")
    await waitForPendingWrites(guestApp.db)

    await unionMergeInto(guestApp.auth, guestApp.db, googleCred(), guestUid)

    const days = await readAllDays(guestApp.db, existingUid)
    const byDay = new Map(days.map((d) => [d.day, d.coverage]))
    // Conflict: the existing account's label stands; the Guest's unique one lands.
    expect(byDay.get("2026-07-10")).toBe("everything")
    expect(byDay.get("2026-07-11")).toBe("most")
  })

  it("recognises the real collision error a sign-in throws", async () => {
    // The link attempt against an already-claimed account throws the exact error
    // completeGoogleRedirect keys the union merge off. We can't drive the whole
    // redirect flow headlessly — the credential the merge then needs lives in
    // the redirect error, which the emulator only mints through a browser — so
    // this pins the detection, and the unionMergeInto test above pins the merge.
    await clearFirestoreData()
    await seedExistingAccount(["stew"], 1800)
    await seedGuest(["salad"], 1500)

    let caught: unknown
    try {
      await linkWithCredential(guestApp.auth.currentUser!, googleCred())
    } catch (err) {
      caught = err
    }
    expect(isCredentialInUseError(caught)).toBe(true)
    expect(isCredentialInUseError(new Error("boom"))).toBe(false)
  })

  it("carries a merged Entry over faithfully, keeping its Day and Source", async () => {
    await clearFirestoreData()
    const existingUid = await seedExistingAccount(["oats"], 2000)
    const guestUid = await seedGuest([], 2000)
    // A richer Guest Entry to prove the whole shape survives the copy.
    addEntry(guestApp.db, guestUid, {
      date: "2026-07-11",
      label: "protein bar",
      kcal: 210,
      protein: 20,
      source: "ai",
      flagged: ["protein"],
    })
    await waitForPendingWrites(guestApp.db)

    await unionMergeInto(guestApp.auth, guestApp.db, googleCred(), guestUid)

    const merged = await readAllEntries(guestApp.db, existingUid)
    const bar = await waitFor(() =>
      merged.find((e) => e.label === "protein bar")
    )
    expect(bar).toMatchObject({
      date: "2026-07-11",
      kcal: 210,
      protein: 20,
      source: "ai",
      flagged: ["protein"],
    })
  })
})

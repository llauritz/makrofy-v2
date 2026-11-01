// Seam: the Firestore security-rules boundary — every user's data lives under
// /users/{uid}/... and only that user may touch it (ADR 0003, spec § Data & sync,
// docs/research/firebase-backend-validation.md § 3).
import { readFileSync } from "node:fs"
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore"
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest"

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "goyaffle",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
})

const seedAliceEntry = () =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users/alice/entries/e1"), {
      date: "2026-07-11",
      label: "porridge",
      kcal: 320,
    })
  })

describe("a user in their own subtree", () => {
  it("can write, read, and delete their own Entries", async () => {
    const db = env.authenticatedContext("alice").firestore()
    const entry = doc(db, "users/alice/entries/e1")
    await assertSucceeds(
      setDoc(entry, { date: "2026-07-11", label: "porridge", kcal: 320 }),
    )
    await assertSucceeds(getDoc(entry))
    await assertSucceeds(getDocs(collection(db, "users/alice/entries")))
    await assertSucceeds(deleteDoc(entry))
  })

  it("can write and read their own Goal", async () => {
    const db = env.authenticatedContext("alice").firestore()
    const goal = doc(db, "users/alice/settings/goal")
    await assertSucceeds(setDoc(goal, { kcal: 2000 }))
    await assertSucceeds(getDoc(goal))
  })
})

describe("a different signed-in user", () => {
  it("cannot read another user's Entries", async () => {
    await seedAliceEntry()
    const db = env.authenticatedContext("mallory").firestore()
    await assertFails(getDoc(doc(db, "users/alice/entries/e1")))
    await assertFails(getDocs(collection(db, "users/alice/entries")))
  })

  it("cannot write into another user's subtree", async () => {
    const db = env.authenticatedContext("mallory").firestore()
    await assertFails(
      setDoc(doc(db, "users/alice/entries/e2"), { date: "2026-07-11", label: "x", kcal: 1 }),
    )
    await assertFails(setDoc(doc(db, "users/alice/settings/goal"), { kcal: 1 }))
  })

  it("cannot delete another user's Entries", async () => {
    await seedAliceEntry()
    const db = env.authenticatedContext("mallory").firestore()
    await assertFails(deleteDoc(doc(db, "users/alice/entries/e1")))
  })
})

describe("an unauthenticated caller", () => {
  it("can touch nothing", async () => {
    await seedAliceEntry()
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, "users/alice/entries/e1")))
    await assertFails(
      setDoc(doc(db, "users/alice/entries/e2"), { date: "2026-07-11", label: "x", kcal: 1 }),
    )
  })
})

// ADR 0012: the entitlement doc is the Paddle webhook's alone to write.
describe("the entitlement doc (settings/subscription)", () => {
  const seedPro = () =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice/settings/subscription"), {
        plan: "pro",
        status: "active",
      })
    })

  it("is readable by its owner", async () => {
    await seedPro()
    const db = env.authenticatedContext("alice").firestore()
    await assertSucceeds(getDoc(doc(db, "users/alice/settings/subscription")))
  })

  it("cannot be created, changed, or deleted by its owner", async () => {
    const db = env.authenticatedContext("alice").firestore()
    const ref = doc(db, "users/alice/settings/subscription")
    await assertFails(setDoc(ref, { plan: "unlimited", status: "active" }))
    await seedPro()
    await assertFails(setDoc(ref, { plan: "unlimited" }, { merge: true }))
    await assertFails(deleteDoc(ref))
  })

  it("is invisible to other users", async () => {
    await seedPro()
    const db = env.authenticatedContext("mallory").firestore()
    await assertFails(getDoc(doc(db, "users/alice/settings/subscription")))
  })

  it("leaves the rest of settings and the AI cycle docs writable", async () => {
    const db = env.authenticatedContext("alice").firestore()
    await assertSucceeds(setDoc(doc(db, "users/alice/settings/goal"), { kcal: 1800 }))
    await assertSucceeds(
      setDoc(doc(db, "users/alice/aiCycles/2026-11-01T00:00:00.000Z"), { fills: 1 }),
    )
  })
})

describe("server-only collections outside /users", () => {
  it("refuse every client", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "paddleEvents/evt_1"), { uid: "alice" })
    })
    const db = env.authenticatedContext("alice").firestore()
    await assertFails(getDoc(doc(db, "paddleEvents/evt_1")))
    await assertFails(setDoc(doc(db, "paddleEvents/evt_2"), { uid: "alice" }))
  })
})

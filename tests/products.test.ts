// Seam: the products module — the only way the Glossary's curation overlay is
// written and observed (issue #40, ADR 0009; CONTEXT.md for Reading / Pin /
// Alias / Glossary). Corrections live in a synced overlay collection
// /users/{uid}/products/{key}; logged Entries are never touched. Every write
// is queued and fire-and-forget like the entries module, so the tests drain
// pending writes and read the state back through the listener.
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { waitForPendingWrites } from "firebase/firestore"
import {
  appendReadingDeletion,
  appendReadingEdit,
  deleteProduct,
  listenToOverlays,
  mergeProducts,
  readAllOverlays,
  setPin,
  unmergeAlias,
  writeMissingOverlays,
} from "@/data/products"
import type { OverlayMap, ProductOverlay } from "@/lib/suggestions"
import { ensureIdentity } from "@/data/identity"
import {
  clearFirestoreData,
  createEmulatorApp,
  destroyEmulatorApp,
  waitFor,
  type EmulatorApp,
} from "./emulator"

describe("the curation overlay", () => {
  let ctx: EmulatorApp
  let uid: string
  let stops: Array<() => void>

  beforeEach(async () => {
    await clearFirestoreData()
    ctx = createEmulatorApp()
    uid = (await ensureIdentity(ctx.auth)).uid
    stops = []
  })

  afterEach(async () => {
    stops.forEach((stop) => stop())
    await destroyEmulatorApp(ctx)
  })

  const observe = () => {
    const states: OverlayMap[] = []
    stops.push(listenToOverlays(ctx.db, uid, (map) => states.push(map)))
    return states
  }

  // The latest observed overlay for a key, once it satisfies `match`.
  const waitForOverlay = (
    states: OverlayMap[],
    key: string,
    match: (o: ProductOverlay) => boolean = () => true
  ) =>
    waitFor(() => {
      const latest = states[states.length - 1]?.get(key)
      return latest && match(latest) ? latest : undefined
    })

  it("surfaces an appended Reading edit, keyed by the Product key", async () => {
    const states = observe()
    appendReadingEdit(ctx.db, uid, "count:brownie", {
      from: 260,
      rate: { kcal: 89 },
    })
    const overlay = await waitForOverlay(states, "count:brownie")
    expect(overlay.edits).toHaveLength(1)
    expect(overlay.edits![0]).toMatchObject({ from: 260, rate: { kcal: 89 } })
    expect(typeof overlay.edits![0].atMs).toBe("number")
  })

  it("round-trips a key with separators and spaces intact", async () => {
    const states = observe()
    appendReadingDeletion(ctx.db, uid, "mass:peanut butter", 6)
    const overlay = await waitForOverlay(states, "mass:peanut butter")
    expect(overlay.key).toBe("mass:peanut butter")
    expect(overlay.deletions).toHaveLength(1)
    expect(overlay.deletions![0]).toMatchObject({ from: 6 })
  })

  it("accumulates successive edits rather than replacing them", async () => {
    const states = observe()
    appendReadingEdit(ctx.db, uid, "count:brownie", {
      from: 260,
      rate: { kcal: 89 },
    })
    await waitForOverlay(states, "count:brownie", (o) => o.edits?.length === 1)
    appendReadingEdit(ctx.db, uid, "count:brownie", {
      from: 89,
      rate: { kcal: 95, protein: 2 },
    })
    const overlay = await waitForOverlay(
      states,
      "count:brownie",
      (o) => o.edits?.length === 2
    )
    expect(overlay.edits).toHaveLength(2)
  })

  it("repins onto the edited value so the pin follows the Reading", async () => {
    const states = observe()
    setPin(ctx.db, uid, "count:brownie", 260)
    await waitForOverlay(states, "count:brownie", (o) => o.pinnedRate === 260)
    appendReadingEdit(
      ctx.db,
      uid,
      "count:brownie",
      { from: 260, rate: { kcal: 89 } },
      true // repin
    )
    const overlay = await waitForOverlay(
      states,
      "count:brownie",
      (o) => o.pinnedRate === 89
    )
    expect(overlay.pinnedRate).toBe(89)
  })

  it("clears the pin when the pinned Reading is deleted", async () => {
    const states = observe()
    setPin(ctx.db, uid, "count:brownie", 260)
    await waitForOverlay(states, "count:brownie", (o) => o.pinnedRate === 260)
    appendReadingDeletion(ctx.db, uid, "count:brownie", 260, true) // unpin
    const overlay = await waitForOverlay(
      states,
      "count:brownie",
      (o) => o.deletions?.length === 1
    )
    expect(overlay.pinnedRate).toBeUndefined()
  })

  it("sets and clears a Pin", async () => {
    const states = observe()
    setPin(ctx.db, uid, "count:egg", 78)
    await waitForOverlay(states, "count:egg", (o) => o.pinnedRate === 78)
    setPin(ctx.db, uid, "count:egg", null)
    const overlay = await waitForOverlay(
      states,
      "count:egg",
      (o) => o.pinnedRate === undefined
    )
    expect(overlay.pinnedRate).toBeUndefined()
  })

  it("merges an Alias onto the survivor and unmerges it again", async () => {
    const states = observe()
    const alias = mergeProducts(ctx.db, uid, "mass:banana", {
      key: "mass:banangs",
      label: "Banangs",
    })
    expect(alias).toMatchObject({ key: "mass:banangs", label: "Banangs" })
    const merged = await waitForOverlay(
      states,
      "mass:banana",
      (o) => (o.aliases?.length ?? 0) === 1
    )
    expect(merged.aliases).toEqual([alias])

    // Undo passes back the exact Alias merge returned.
    unmergeAlias(ctx.db, uid, "mass:banana", alias)
    const unmerged = await waitForOverlay(
      states,
      "mass:banana",
      (o) => (o.aliases?.length ?? 0) === 0
    )
    expect(unmerged.aliases ?? []).toEqual([])
  })

  it("delete replaces the doc with a lone timestamp, clearing prior state", async () => {
    const states = observe()
    // Prior curation on the Product.
    setPin(ctx.db, uid, "count:brownie", 260)
    appendReadingEdit(ctx.db, uid, "count:brownie", {
      from: 260,
      rate: { kcal: 89 },
    })
    await waitForOverlay(states, "count:brownie", (o) => o.pinnedRate === 260)

    deleteProduct(ctx.db, uid, "count:brownie")
    const overlay = await waitForOverlay(
      states,
      "count:brownie",
      (o) => o.deletedAtMs !== undefined
    )
    expect(typeof overlay.deletedAtMs).toBe("number")
    expect(overlay.pinnedRate).toBeUndefined()
    expect(overlay.edits ?? []).toEqual([])
  })
})

// The read + write-missing pair backing the overlay's half of the union merge
// (ADR 0002/0009, #19): a Guest's overlay docs union into an existing account,
// the existing account winning any key both hold.
describe("copying overlays for the union merge", () => {
  let ctx: EmulatorApp
  let uid: string

  beforeEach(async () => {
    await clearFirestoreData()
    ctx = createEmulatorApp()
    uid = (await ensureIdentity(ctx.auth)).uid
  })

  afterEach(async () => {
    await destroyEmulatorApp(ctx)
  })

  it("reads every overlay doc, its key intact", async () => {
    setPin(ctx.db, uid, "count:egg", 78)
    mergeProducts(ctx.db, uid, "mass:banana", {
      key: "mass:banangs",
      label: "Banangs",
    })
    await waitForPendingWrites(ctx.db)

    const docs = await readAllOverlays(ctx.db, uid)
    expect(docs.map((d) => d.key).sort()).toEqual(["count:egg", "mass:banana"])
  })

  it("writes only the keys the destination lacks — the existing account wins", async () => {
    // Destination already has an opinion on count:egg.
    setPin(ctx.db, uid, "count:egg", 80)
    await waitForPendingWrites(ctx.db)

    await writeMissingOverlays(ctx.db, uid, [
      { key: "count:egg", pinnedRate: 78 }, // conflict — must NOT overwrite
      { key: "count:oats", pinnedRate: 380 }, // new — must land
    ])

    const docs = await readAllOverlays(ctx.db, uid)
    const byKey = new Map(docs.map((d) => [d.key, d]))
    expect(byKey.get("count:egg")?.pinnedRate).toBe(80)
    expect(byKey.get("count:oats")?.pinnedRate).toBe(380)
  })
})

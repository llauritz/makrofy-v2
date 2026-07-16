import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore"

import type { Alias, OverlayMap, ProductOverlay, Rate } from "@/lib/suggestions"

// The Glossary's curation overlay (issue #40, ADR 0009). All of a Product's
// stored corrections — Reading edits and deletions, a Pin, Aliases, a delete —
// live in one synced doc /users/{uid}/products/{key}, applied as the final step
// of the derived index (buildProductIndex). Logged Entries are never touched.
//
// Every mutation is queued and fire-and-forget, exactly like the entries module
// (ADR 0001): offline it would never be server-acknowledged, and the SDK's
// listeners reflect it immediately. Writes stay single-document merges so they
// commit offline — no transactions (which need the server) on a curation path.
// The caller supplies the pin follow-through (repin on edit, unpin on delete)
// so the correction and its pin land in the same offline write. Each correction
// is stamped with the wall clock here, at write time, the way addEntry stamps
// its Entry — the caller never handles the clock.

// A Product key ("mass:peanut butter") carries ':' and spaces and could carry
// '/', none safe raw in a document id — encode it, decode on the way back.
function productDoc(db: Firestore, uid: string, key: string) {
  return doc(collection(db, "users", uid, "products"), encodeURIComponent(key))
}

function productsCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "products")
}

/**
 * Append a Reading edit: past votes at ~`from` will read `rate` instead
 * (buildProductIndex applies it). `from: null` seeds a fresh ×1 Reading on a
 * rate-less Product. `repin` carries an existing Pin onto the new value in the
 * same write, so pinning then editing keeps the pin on the Reading rather than
 * stranding it on the old rate.
 */
export function appendReadingEdit(
  db: Firestore,
  uid: string,
  key: string,
  edit: { from: number | null; rate: Rate },
  repin = false
): void {
  const data: Record<string, unknown> = {
    edits: arrayUnion({
      from: edit.from,
      rate: cleanRate(edit.rate),
      atMs: Date.now(),
    }),
  }
  if (repin) data.pinnedRate = edit.rate.kcal
  write(productDoc(db, uid, key), data)
}

/**
 * Append a Reading deletion: past votes at ~`from` are silenced (a later Entry
 * re-attests fresh). `unpin` clears the Pin in the same write when the deleted
 * Reading was the pinned one.
 */
export function appendReadingDeletion(
  db: Firestore,
  uid: string,
  key: string,
  from: number,
  unpin = false
): void {
  const data: Record<string, unknown> = {
    deletions: arrayUnion({ from, atMs: Date.now() }),
  }
  if (unpin) data.pinnedRate = deleteField()
  write(productDoc(db, uid, key), data)
}

/** Pin a Reading as the Rate (its per-unit kcal), or clear the Pin with null. */
export function setPin(
  db: Firestore,
  uid: string,
  key: string,
  rateKcal: number | null
): void {
  write(productDoc(db, uid, key), {
    pinnedRate: rateKcal === null ? deleteField() : rateKcal,
  })
}

/**
 * Merge a Product into a survivor by recording the absorbed label as an Alias
 * on the survivor. The index then pools the absorbed Entries under the survivor
 * and its label wins everywhere. Returns the Alias it stored so the caller can
 * offer an undo (unmergeAlias reverses it, matching the exact Alias).
 */
export function mergeProducts(
  db: Firestore,
  uid: string,
  survivorKey: string,
  absorbed: { key: string; label: string }
): Alias {
  const alias: Alias = {
    key: absorbed.key,
    label: absorbed.label,
    atMs: Date.now(),
  }
  write(productDoc(db, uid, survivorKey), { aliases: arrayUnion(alias) })
  return alias
}

/** Remove one Alias from a survivor — the absorbed Product comes back. */
export function unmergeAlias(
  db: Firestore,
  uid: string,
  survivorKey: string,
  alias: Alias
): void {
  // arrayRemove matches by value; the caller passes the Alias it read back, so
  // it is byte-identical to the stored one.
  updateDoc(productDoc(db, uid, survivorKey), {
    aliases: arrayRemove(cleanAlias(alias)),
  }).catch((err) => console.error("Alias unmerge failed", survivorKey, err))
}

/**
 * Delete a Product — a timestamped forget (CONTEXT.md "Glossary"). The doc is
 * replaced (not merged) with a lone `deletedAtMs`, so every prior correction
 * clears; the index drops every Entry logged at or before it, and later Entries
 * recreate the Product fresh.
 */
export function deleteProduct(db: Firestore, uid: string, key: string): void {
  setDoc(productDoc(db, uid, key), { deletedAtMs: Date.now() }).catch((err) =>
    console.error("Product delete failed", key, err)
  )
}

/** Observe the whole curation overlay, by Product key. */
export function listenToOverlays(
  db: Firestore,
  uid: string,
  onChange: (overlays: OverlayMap) => void
): Unsubscribe {
  return onSnapshot(productsCollection(db, uid), (snap) =>
    onChange(toOverlayMap(snap))
  )
}

/**
 * One-shot read of every overlay doc — the merge source when a Guest signs into
 * an existing account (ADR 0002/0009, #19), mirroring readAllEntries.
 */
export async function readAllOverlays(
  db: Firestore,
  uid: string
): Promise<ProductOverlay[]> {
  return [...toOverlayMap(await getDocs(productsCollection(db, uid))).values()]
}

/**
 * Write only the overlay keys the destination account lacks — the union merge's
 * "existing account wins per key" rule (issue #40). A no-op for an empty set.
 */
export async function writeMissingOverlays(
  db: Firestore,
  uid: string,
  overlays: ProductOverlay[]
): Promise<void> {
  if (overlays.length === 0) return
  const existing = await getDocs(productsCollection(db, uid))
  const have = new Set(existing.docs.map((d) => decodeURIComponent(d.id)))
  const batch = writeBatch(db)
  let pending = 0
  for (const overlay of overlays) {
    if (have.has(overlay.key)) continue
    batch.set(productDoc(db, uid, overlay.key), toDocData(overlay))
    pending += 1
  }
  if (pending > 0) await batch.commit()
}

// Queue a merge write and log any eventual failure — the fire-and-forget shape
// every mutation above shares (see the module note).
function write(
  ref: ReturnType<typeof productDoc>,
  data: Record<string, unknown>
) {
  setDoc(ref, data, { merge: true }).catch((err) =>
    console.error("Overlay write failed", ref.id, err)
  )
}

function toOverlayMap(snap: QuerySnapshot): OverlayMap {
  const map = new Map<string, ProductOverlay>()
  for (const d of snap.docs) {
    const key = decodeURIComponent(d.id)
    map.set(key, { key, ...d.data() } as ProductOverlay)
  }
  return map
}

// An overlay's persisted shape: every stored field but the key (that's the
// document id). Undefined optionals are dropped so a copy never carries them.
function toDocData(overlay: ProductOverlay): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  if (overlay.edits) data.edits = overlay.edits
  if (overlay.deletions) data.deletions = overlay.deletions
  if (overlay.pinnedRate !== undefined) data.pinnedRate = overlay.pinnedRate
  if (overlay.aliases) data.aliases = overlay.aliases
  if (overlay.deletedAtMs !== undefined) data.deletedAtMs = overlay.deletedAtMs
  return data
}

// Firestore rejects undefined fields; keep only the macros a Rate actually has.
function cleanRate(rate: Rate): Rate {
  const out: Rate = { kcal: rate.kcal }
  if (rate.protein !== undefined) out.protein = rate.protein
  if (rate.fat !== undefined) out.fat = rate.fat
  if (rate.carbs !== undefined) out.carbs = rate.carbs
  return out
}

const cleanAlias = (alias: Alias): Alias => ({
  key: alias.key,
  label: alias.label,
  atMs: alias.atMs,
})

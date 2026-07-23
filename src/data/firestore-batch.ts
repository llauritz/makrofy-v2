import { writeBatch, type Firestore, type WriteBatch } from "firebase/firestore"

// Firestore caps a single WriteBatch at 500 operations. A whole-profile write —
// a backup import (#24) or a large union merge (ADR 0002) — can carry more
// Entries or Days than that, so commits are split into chunks safely under the
// cap. Chunks commit in sequence; each is atomic, the set as a whole is not,
// which is fine for these id-keyed, re-runnable writes (a re-import skips what
// already landed).
const MAX_BATCH = 450

/**
 * Apply `count` writes in batches of at most MAX_BATCH, committing each before
 * the next. `apply` stages write `index` onto the given batch. A count of 0
 * commits nothing.
 */
export async function commitInChunks(
  db: Firestore,
  count: number,
  apply: (batch: WriteBatch, index: number) => void,
): Promise<void> {
  for (let start = 0; start < count; start += MAX_BATCH) {
    const batch = writeBatch(db)
    const end = Math.min(start + MAX_BATCH, count)
    for (let i = start; i < end; i += 1) apply(batch, i)
    await batch.commit()
  }
}

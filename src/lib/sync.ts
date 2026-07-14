// The header sync indicator's state, derived — never a spinner (spec § PWA &
// offline). Kept pure and Firebase-free so it can be reasoned about and tested
// in isolation; src/data/hooks.ts feeds it live snapshot metadata and the
// auth-health signal.

/**
 * "synced" — the spec's silent state: fully synced, nothing for the header to
 *   show.
 * "pending" — offline or with local writes still queued; a tap explains.
 * "attention" — an auth-expired write pause; a tap re-auths.
 */
export type SyncStatus = "synced" | "pending" | "attention"

/** The slice of a Firestore snapshot's metadata the indicator reads. */
export interface SnapshotMeta {
  hasPendingWrites: boolean
  fromCache: boolean
}

/**
 * Which sync state applies. Attention outranks pending: a lapsed identity is the
 * reason the writes are stuck, and it is the one state whose tap must re-auth
 * rather than just explain, so it can't be masked by the ordinary offline path.
 * Otherwise offline (`fromCache`) and queued writes (`hasPendingWrites`) collapse
 * into the single pending state (issue #19); everything else is silent.
 */
export function resolveSyncStatus(
  meta: SnapshotMeta,
  { authExpired }: { authExpired: boolean },
): SyncStatus {
  if (authExpired) return "attention"
  if (meta.fromCache || meta.hasPendingWrites) return "pending"
  return "synced"
}

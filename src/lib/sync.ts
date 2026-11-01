// The header sync indicator's state, derived — never a spinner (spec § PWA &
// offline). Kept pure and Firebase-free so it can be reasoned about and tested
// in isolation; src/data/hooks.ts feeds it live snapshot metadata, the
// auth-health signal and the browser's online flag.

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

/**
 * How long an attention state, or any non-synced state while the browser is
 * offline, must last before the header shows it. A deliberate sign-out
 * re-mints a Guest well inside it, so attention never flashes.
 */
export const SYNC_SETTLE_MS = 1_200

/**
 * How long a non-synced state must last while the browser reports a
 * connection. Online, "not synced yet" is almost always just the launch's (or
 * a resume's) cache→server hop, or a write waiting for its ack — on a slow
 * phone connection that runs past a second, and flashing the offline cloud for
 * it reads as a fault. Only a sync that is genuinely stuck this long, despite
 * a connection, is worth surfacing.
 */
export const SLOW_SYNC_MS = 10_000

/**
 * How long `status` must persist before the header shows it. Synced shows at
 * once (the user never waits to learn they're fine); attention after the
 * short settle, since its tap is the fix; pending after the short settle when
 * the device is offline — the case the explanation is written for — and only
 * after SLOW_SYNC_MS when it is online.
 */
export function revealDelayMs(
  status: SyncStatus,
  { online }: { online: boolean },
): number {
  if (status === "synced") return 0
  if (status === "attention") return SYNC_SETTLE_MS
  return online ? SLOW_SYNC_MS : SYNC_SETTLE_MS
}

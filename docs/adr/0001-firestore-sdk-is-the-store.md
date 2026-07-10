# The Firestore SDK is the store

V1 kept its data in localStorage and pushed changes to Supabase through a hand-rolled sync layer that swallowed errors, never propagated deletes, and had no conflict handling. V2 has no separate local database and no custom sync layer at all: the Firestore JS SDK, initialized with `persistentLocalCache` and the multi-tab manager, **is** the store. All reads, writes, and listeners go through Firestore; its IndexedDB cache provides full offline use, queued writes, and last-write-wins reconciliation on reconnect.

## Considered Options

- **Dexie/IndexedDB as source of truth + custom sync to Firestore** — rejected: architecturally the V1 design; we would own tombstones, retry queues, and every merge bug ourselves.
- **Hybrid (local DB for guests, Firestore when signed in)** — rejected: two storage engines and a migration seam through the whole app.

## Consequences

- Guests need a Firebase identity from first launch (see ADR 0002); the very first launch requires momentary connectivity to mint it.
- The sync indicator is fed by snapshot metadata (`hasPendingWrites` / `fromCache`), not by a custom queue.
- The service worker must not cache Firestore traffic; it owns static assets only (see `docs/research/firebase-backend-validation.md`).

---
status: accepted
---

# Launch paints from a boot mirror; Firebase reconciles underneath

The app's data layer is already local-first (ADR 0001: the Firestore SDK's
persistent cache *is* the store, the service worker precaches the shell), yet
a warm online launch held the splash for a network round-trip: measured ~400ms
on desktop and ~1s on phone-class hardware — while the same launch *offline*
took ~140ms. The gap is identity, not data. Firebase Auth's init re-validates
the persisted user against the server (`accounts:lookup`) before it fires its
first auth event (`initializeCurrentUser` → `reloadAndSetCurrentUserOrClear`,
@firebase/auth 1.13.3), and Firestore blocks its client init — including
cache-only snapshot delivery — on that first event (its credentials provider
registers via `addAuthTokenListener`, which only fires once auth settles).
There is no SDK flag to skip the revalidation, so every online launch pays a
round-trip before the first useful frame.

> **The boot mirror** (`src/data/boot-mirror.ts`): one versioned localStorage
> key holding the last-rendered launch state — `{ uid, goal, day, entries }`.
> `startBootMirror` (wired in main.tsx) follows auth and holds a Goal listener
> plus a today's-Day listener per uid, writing on every change. The data hooks
> seed their initial state from it (`useIdentity`, `useGoalStatus`, `useGoal`,
> `useDay`) and hand over to the live values the moment the SDK settles. The
> mirror is never the source of truth — only the first frame.

## Why a mirror and not less

Seeding only the uid was considered and rejected: the splash gates on
`useGoalStatus`, whose first snapshot Firestore withholds until auth settles —
the uid alone ends nothing. The mirror therefore carries exactly what the
first paint needs: uid (gates every listener), Goal (gates the splash), and
today's Entries (so the Day view doesn't flash empty and fill in). The
remaining hooks (`useLoggedDays`, `useProductIndex`, `useSyncStatus`) fill
late harmlessly: strip dots pop in, typeahead only matters once typing, and
the sync indicator's settle window (spec § PWA & offline) already rides out
the launch.

## Boundaries that keep it safe

- **Exact-match seeding.** A hook seeds only when its uid (and Day) equal the
  mirror's. A launch on a later day starts empty — correct, a new day *is*
  empty. Another profile's data can never seed under a different uid: a uid
  switch (sign-out → fresh Guest, union merge) resets the mirrored data in the
  same write that moves the uid.
- **Settled auth wins outright.** When the first real auth event arrives, its
  value replaces the seed — including null (server-side deletion, sign-out
  gap), which restores the splash path. The seed changes what shows *before*
  the SDK speaks, never after.
- **Failure means splash, never worse.** No mirror, corrupt JSON, storage
  unavailable or over quota all read as "nothing mirrored" — the launch
  behaves exactly as before this ADR. The key is versioned (`v1`); a schema
  change ships as `v2` and costs one splashed launch, not a parse hazard.
- **No extra reads.** The mirror's two listeners duplicate queries the UI
  already holds; the SDK serves both from one cache and one server stream.

The stale-first-frame trade is accepted: entries logged on another device
since this device last synced appear only when the live listeners deliver —
the "local copy instantly, fetch changes lazily" contract, and the same one
the Firestore cache already imposes on every other screen.

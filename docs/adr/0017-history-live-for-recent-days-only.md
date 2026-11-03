---
status: accepted
---

# The Entry history is live for the last 35 Days only

Price review, 3 November 2026. Refines ADR 0005's "full-history listener".

Firestore bills a listener that has been disconnected for more than 30 minutes
as a brand-new query. The app listened to the whole entries collection, so
every return after a break re-read every Entry the user had ever logged: about
76,000 reads a day for a two-year-old heavy account, and the 100,000 a day seen
in testing.

## Decisions

- **Split at a cutoff Day** (`historyCutoff`, `RECENT_DAYS = 35`). The recent
  half is a normal live listener, so another device's edits and deletes arrive
  as they happen. The older half is a cache-only listener (`source: "cache"`):
  free, and still live for this phone's own edits and deletes.
- **Refresh the older half from the server** once every 7 Days, on a new
  device, or when the cache holds fewer Entries than the last refresh counted.
  The refresh is a temporary live listener that waits for
  `fromCache: false`, which the SDK reports only after resolving Entries
  deleted elsewhere; then it detaches. The time and count are kept in
  localStorage per uid.
- **The sync indicator** listens to the same two halves (same targets, no
  extra reads): connection state from the recent half, queued writes from
  either.
- `listenToAllEntries` keeps its signature, so the Day-strip dots, typeahead,
  stats and the boot mirror needed no change.

## Consequences

- An old Entry edited or deleted on another device shows on this one within
  a week, not at once. Entries never move between Days, so nothing else drifts.
- Reads per return fall from the whole history to about five weeks of Entries.

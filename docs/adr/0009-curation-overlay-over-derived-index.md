---
status: accepted
---

# Stored corrections over a derived index: the `products` overlay collection

The Glossary (#40) lets the user curate their food index — correct a Reading, delete or pin one, merge typo Products, forget a Product. None of it may touch a logged Entry: **a past Day's totals are inviolable** (CONTEXT.md "Glossary"). Yet the index those curations act on is *derived* from Entries at runtime, materialized nowhere (ADR 0005). So the corrections need a home that is neither the Entries nor a rebuilt index.

They live in a per-Product **overlay**: `/users/{uid}/products/{key}`, doc-id the Product key (kind + stripped label, URL-encoded). One doc holds all of that Product's corrections — `edits[]`, `deletions[]`, `pinnedRate`, `aliases[]`, `deletedAtMs` — and a doc exists only for a Product someone has curated. The derivation gains one final step:

> derive Products and Readings from Entries (ADR 0005) → **apply the overlay** (rewrite votes, silence votes, pin, re-key aliases, forget deletes) → Rates.

## Why this doesn't reopen ADR 0005

ADR 0005 banned a *materialized index* — a second copy of derived data (counts, Readings) that drifts from the log. This stores the opposite: **only the corrections**, which are user judgements that *cannot* be derived from Entries — exactly the test ADR 0006 applied to Coverage. The history stays fully derived; a delete still falls straight out of the index; frecency still tunes freely. What's persisted is small, authored, and non-recomputable, so it has no derived truth to drift from. This makes `products` the same architectural species as ADR 0006's `days` sidecar: a non-authoritative overlay keyed off derived data.

## Corrections carry their own clock

Each edit and deletion is stamped `atMs` at write time (like `addEntry`'s server stamp) and **reaches only the votes logged at or before it**. That is what lets a Reading deletion silence today's votes while a *future* Entry re-attests the same value fresh, and what makes a Product delete a **timestamped forget** — Entries before it drop, Entries after recreate the Product clean. Because every mutation is a single-document merge (no transaction — those need the server), curation works offline like every other write (ADR 0001); the caller folds a pin's follow-through (repin on edit, unpin on delete) into the same write rather than reading-then-writing.

## Considered options

- **Rewrite the Entries** a correction concerns — rejected outright: it changes past Days and destroys the audit the log *is*. The whole feature exists to avoid this.
- **Materialize the whole index and edit it in place** — rejected: ADR 0005's drift, now with user edits racing the derivation.
- **Store corrections as marker Entries** in the entries collection — rejected for the same reason ADR 0006 rejected it for Coverage: it pollutes the log, the typeahead, and every Entry consumer.
- **One map doc** (`settings/products`) — rejected: unbounded single-doc growth and a whole-doc rewrite per correction, the same 1 MB trap ADR 0006 avoided.

## Consequences

- **Union merge** (ADR 0002): the overlay unions by Product key, the existing account winning any key both hold — the settings-like rule, not Entries' union. (Entries still union; only the corrections defer.)
- **Export/import** (#24) must carry the `products` collection, or curation is lost on migration — the same requirement ADR 0006 put on `days`.
- **Orphaned overlays**: a merged-away Product's own overlay is left in place, dormant while its Entries route to the survivor, and returns intact on unmerge. Harmless — the derivation only consults the key an Entry actually lands under.
- **Security rules** are already satisfied by the existing `/users/{userId}/{document=**}` UID-match.
- **Numbering**: this is 0009 — 0006 is the `days` sidecar, 0007 the motion law, 0008 the Day-strip navigator; the #40 ticket's "ADR 0007" predates all three reservations.

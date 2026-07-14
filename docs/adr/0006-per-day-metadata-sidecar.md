---
status: accepted
---

# A per-Day metadata sidecar: the `days` collection

Until now a Day had no persisted representation — it was only a `date` string smeared across Entries (ADR 0003). Coverage is the first piece of Day state that *cannot* be derived from Entries (it is a human judgement *about* a Day), so we give the Day a home: `/users/{uid}/days/{YYYY-MM-DD}`, doc-id **is** the date, first and only field today `{ coverage: 'some'|'most'|'everything', updatedAt }`. A doc exists only for Days that carry metadata; no doc means none.

Two guardrails are the whole point of this record, and both are load-bearing:

1. **It is a sidecar, never an authority.** A Day and its Entries exist entirely independent of this doc; its *absence* means "no metadata," never "no day." Entries remain the single source of truth and stats still range-query Entries — the `days` doc only *annotates*. This is what keeps ADR 0003's flat-entries model intact.
2. **Only non-derivable, user-authored metadata — never cached aggregates.** No per-day kcal totals, macro sums, or anything computable from Entries. The moment a total is denormalised into here it drifts from the log — the "materialized favorites drift" failure V1 is sworn off (see the wayfinder map). Coverage qualifies precisely because it can't be derived.

The one-field-today rule is deliberate: the *shape* is general so future per-Day metadata (a note, a mood) has an obvious home without spawning a new collection each time, but new fields land only when a real feature needs them — the shape's generality is not licence to invent fields now.

## Considered options

- **A narrow `coverage` collection** — rejected: Day is already a normative domain term (see CONTEXT.md) with no home; a coverage-only collection would force a *new* sibling collection per future per-Day annotation, each adding a range-query to stats.
- **A marker Entry in the entries collection** — rejected: pollutes the log, the typeahead, and every Entry consumer.
- **One map doc** (`settings/coverage` = `{ '2026-07-13': 'some', … }`) — rejected: unbounded single-doc growth, a whole-doc rewrite on every label, and an eventual 1 MB ceiling.
- **Per-day *subcollections*** — already rejected by ADR 0003 because they break the full-history query. A date-keyed *sibling* collection does not: stats already range-query by date, so a `days` overlay drops straight in. This makes `days` the same architectural species as the Food Glossary's overlay collection (#40) — a non-authoritative overlay keyed off derived data.

## Consequences

- **Union merge** (ADR 0002): on a date collision, the existing account's `days` doc wins — Coverage is a settings-like per-date annotation, not union-able like Entries.
- **Orphaned docs**: deleting every Entry from a labelled Day leaves its `days` doc in place. Harmless — a Day with no Entries contributes nothing to stats regardless of its label; cleanup would couple the entries and days modules for no benefit.
- **Removing a label** is a native delete of the doc (ADR 0004 — no tombstones), returning the Day to the trusted default.
- **Export/import** (#24) must include the `days` collection, or Coverage labels are lost on migration.
- **Security rules** are already satisfied by the existing `/users/{userId}/{document=**}` UID-match.

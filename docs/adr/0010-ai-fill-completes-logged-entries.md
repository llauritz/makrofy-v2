---
status: accepted
---

# AI fill completes logged Entries in place — missing fields only

The ✨ AI fill began as an add-card feature under a strict gate: **"Only Add
commits"** (spec § Add flow) — a fill writes into the form, never the day
log. #53 extends the fill to two surfaces where the Entry *already is* the
log: the inline editor, and the dashed 0-kcal row itself. That needs a
sibling rule, not an exception:

> **On a logged Entry, an AI fill may write only the fields the Entry is
> missing.** A value the user logged is never overwritten — it anchors the
> prompt instead ("porridge (12 g protein)", `promptFrom`), so the estimate
> for the missing fields stays consistent with what's already true. kcal 0
> counts as missing (the dashed-row rule, ADR 0003); a present 0-gram macro
> is a logged value.

## Why the row fill commits without a review step

The add card's gate exists because a draft is *pre-commitment*: nothing is
true until Add. A 0-kcal row is the opposite — the Entry is committed and
counting toward the Day at 0. The ✨ tap on that row is an explicit,
per-Entry intent ("estimate this one"), the write is scoped to fields that
held nothing, and the result is immediately visible in place with the
interpretation note (and any Google Search attribution — compliance) shown
dismissibly in the same card. A wrong estimate is one row-tap away from the
editor. Routing the row fill through the editor instead was considered and
rejected: it would turn a one-tap completion into open → wait → review →
Save for the common case where the user just wants the number.

The row fill writes through `applyAiFill` (entries.ts): the missing values,
`source: 'ai'` (the ✨ provenance marker), and `flagged` for the fields the
model was unsure about *among those it wrote* — doubt about a logged value
has nowhere to sit, so it is dropped (`entryFillFrom`).

## Flags are no longer fixed at commit (amends ADR 0003)

ADR 0003 kept `flagged` persisted past commit "so a future edit form or
'review uncertain entries' feature has the data". The editor is now that
surface: it seeds its dashed outlines from the Entry's `flagged`, tap-to-
accept clears them one by one, and **Save persists the survivors** (an
`EntryEdit` carrying `flagged` reconciles it; an emptied set removes the
field). An edit that says nothing about flags still leaves them untouched,
so no other writer changed meaning.

Editing the label does not clear flags — flags belong to the values, which
a label edit doesn't change. (The add card couples them, but there the whole
draft is provisional.)

## Shared choreography, per-surface application

All three surfaces run the identical round-trip contract — offline note,
per-identity daily quota, stale-reply serial guard, four tiers with the
one-clarifying-question cap — extracted into `useAiFill`. What differs is
only `apply()`: the add card overwrites its whole draft; the editor fills
blanks into form state under Save; the row writes blanks to Firestore
directly. The response zone (`AiZone`) renders inside whichever card asked.

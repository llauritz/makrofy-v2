# Makrofy

A mobile-first, easy-above-all calorie/macro tracker. One user, one food log; every design decision defers to "the app is easy".

## Language

**Entry**:
A single logged food item — label, calories, optional macros — counting toward exactly one Day.
_Avoid_: food, item, log, record

**Day**:
The device-local calendar date an Entry counts toward; the unit of the log view, date stepping, and stats.
_Avoid_: date (for the concept; fine as a field name)

**Backfill**:
Logging an Entry onto any Day other than today, reached via the Day strip or calendar.

**Day strip**:
The main screen's sole day navigator: a horizontally-scrollable rail of Day chips running from 14 days ago through today, plus one dashed *frontier* Day beyond the selection. Anchored on today — a past selection flags its chip without moving the window; tapping the frontier selects it and reveals the next future Day. Selection is a single filled ink pill; unselected today carries an outline ring; a dot marks Days holding Entries. The strip reaches 14 Days either side of today; a Day beyond that is *off-strip* — no chip fills, and the calendar button (inside the rail past the oldest chip, revealed by scrolling to the end) carries the Day's date. Off-strip Days are reached through the calendar: a month-grid bottom sheet that jumps to any date, past or future, dotting logged Days and marking today.
_Avoid_: week strip, day bar, stepper

**Coverage**:
How much of a Day's real food intake the user says made it into the log — *Some*, *Most*, or *Everything*. Governs only a Day's admission to aggregate stats, never the live day view; an unlabeled Day is treated as fully covered.
_Avoid_: confidence, completeness, quality

**Goal**:
The daily calorie (and optional macro) target the progress ring measures against. Set once at onboarding, editable after.
_Avoid_: target, budget

**Guest**:
A user who hasn't signed in. The app is fully usable as a Guest; signing in later keeps everything logged.
_Avoid_: anonymous user (auth-implementation term)

**Union merge**:
What happens when a Guest signs into an account that already has data: both sets of Entries are kept, combined without prompting.

**Suggestion**:
A typeahead result derived from the user's own Entry history. Tapping one fills the add card — it never commits. A Product's competing Readings appear as adjacent Suggestions, never collapsed into one winning row. When the typed text carries a Quantity, the Suggestion is *scaled*: its numbers are recomputed from its Reading's rate to the typed Quantity, a minimal hint shows the base portion it scaled from, and tapping fills numbers only — the typed label stays.
_Avoid_: favorite (V1 concept, superseded), autofill

**Frecency**:
The Suggestion ranking: reuse count decayed by recency (~3-week half-life), so current habits outrank old ones. A Quantity's unit typed into the label boosts same-kind Products in the ranking — it never filters.

**Quantity**:
The amount parsed from the start or end of an Entry label — a number with an optional unit. Kinds: mass, volume, count. A bare number is a count; no number at all means a count of 1.
_Avoid_: amount, portion, serving

**Product**:
What a group of Entries has in common: the same food measured the same way — same label once the Quantity is stripped, same Quantity kind. "30g Banana" and "2 Banana" are different Products; "Banana 30g" and "Banana 0.03kg" are the same one. Suggestions represent Products.
_Avoid_: food, item, staple

**Rate**:
A Product's per-unit calories and macros: its most-attested Reading's value, freshness breaking ties. Entries with zero or missing calories never vote.
_Avoid_: price, factor

**Reading**:
One distinct per-unit value observed in a Product's Entry history, carrying its vote count — implied rates within ±5% of a fresher one merge into its Reading. Readings compete as Suggestions, most-attested first, freshest breaking ties: an outvoted Reading is still offered, never suppressed. Editing a Reading keeps its votes; deleting one silences its past votes (fresh Entries can re-attest the same value).
_Avoid_: bucket, attestation

**Pin**:
An explicit override marking one Reading as the Product's Rate regardless of votes, until unpinned. Outvoted Readings stay visible beneath it.
_Avoid_: lock

**Alias**:
A label absorbed into another Product by a merge — a live mapping: the old label keeps matching, and future Entries logged under it count toward the survivor. Unmerging removes the Alias.
_Avoid_: synonym

**Glossary**:
The user's browsable, alphabetical index of every Product with its Rate and use count. All curation happens here — editing, deleting and pinning Readings, merging and deleting Products — and none of it ever changes logged Entries or past Days. Deleting a Product forgets its past; logging it again recreates it fresh.
_Avoid_: food database, catalog, favorites

**AI fill**:
The Gemini-backed path that fills a surface's numbers from the food's label. It never rewrites the label. In the add card it fills the whole draft and only Add commits; on a logged Entry (the inline editor, or the dashed 0-kcal row's own ✨) it fills only the missing fields — logged values anchor the prompt and are never overwritten (ADR 0010). Committed AI-filled Entries carry the ✨ marker.
_Avoid_: autofill, macro lookup

**Flagged value**:
A number the AI fill was unsure about. Shown dashed until fixed or accepted; Entries remember which values were still flagged at commit, the editor re-shows them for review, and its Save persists the survivors.
_Avoid_: unsure value, estimate

**Source**:
How an Entry's numbers came to be: manual, history (a Suggestion), or ai (an AI fill).

**Meal type**:
Breakfast/lunch/dinner/snack/unknown, attached silently to each Entry (clock-derived when logging on today, unknown on Backfill). Invisible in V2's UI; exists for Health Connect export in V3.

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
Logging an Entry onto any Day other than today via date stepping.

**Goal**:
The daily calorie (and optional macro) target the progress ring measures against. Set once at onboarding, editable after.
_Avoid_: target, budget

**Guest**:
A user who hasn't signed in. The app is fully usable as a Guest; signing in later keeps everything logged.
_Avoid_: anonymous user (auth-implementation term)

**Union merge**:
What happens when a Guest signs into an account that already has data: both sets of Entries are kept, combined without prompting.

**Suggestion**:
A typeahead result derived from the user's own Entry history. Tapping one fills the add card — it never commits.
_Avoid_: favorite (V1 concept, superseded)

**Frecency**:
The Suggestion ranking: reuse count decayed by recency (~3-week half-life), so current habits outrank old ones.

**AI fill**:
The Gemini-backed path that fills the add card's numbers from the typed label. It never rewrites the label; only Add commits. Committed AI-filled Entries carry the ✨ marker.
_Avoid_: autofill, macro lookup

**Flagged value**:
A number the AI fill was unsure about. Shown dashed in the add card until fixed or accepted; Entries remember which values were still flagged at commit.
_Avoid_: unsure value, estimate

**Source**:
How an Entry's numbers came to be: manual, history (a Suggestion), or ai (an AI fill).

**Meal type**:
Breakfast/lunch/dinner/snack/unknown, attached silently to each Entry (clock-derived when logging on today, unknown on Backfill). Invisible in V2's UI; exists for Health Connect export in V3.

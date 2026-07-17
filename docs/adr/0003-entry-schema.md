# Entry schema: one flat collection, Health-Connect-shaped fields

Entries live in a single flat collection — `/users/{uid}/entries/{autoId}` — each doc carrying the Day it counts toward as a `date: 'YYYY-MM-DD'` field (device-local). Per-day subcollections were rejected: stats date-ranges and the typeahead's full-history listener are one query on a flat collection but collection-group gymnastics on subcollections.

```
date:      'YYYY-MM-DD'   — device-local Day it counts toward
label:     string         — the user's text; AI never rewrites it
kcal:      number
protein?, fat?, carbs?:   number (grams) — optional; most entries are kcal-only
mealType:  'breakfast'|'lunch'|'dinner'|'snack'|'unknown'
source:    'manual'|'history'|'ai'       — 'ai' drives the ✨ marker
flagged?:  ('kcal'|'protein'|'fat'|'carbs')[] — values still unsure at commit
createdAt, updatedAt: Timestamp (server)
```

Non-obvious choices:

- **`mealType` has no UI.** It is derived silently from the local clock when logging on today's Day, and stored as `'unknown'` on Backfill (the clock says nothing about when backfilled food was eaten). It exists purely as the cheap Health Connect hook (`NutritionRecord.mealType` is mandatory; kcal + gram units map 1:1) — see `docs/research/health-connect-go-no-go.md`.
- **`flagged` persists past commit** even though V2's day list doesn't render it — kept so an edit form or "review uncertain entries" feature has the data. Since #53 (ADR 0010) the inline editor is that surface: it seeds dashed outlines from `flagged` and its Save reconciles the survivors, and a row-level AI fill may add flags for fields it filled — so flags are no longer fixed at first commit. The AI's interpretation text and grounding state are deliberately *not* stored; Google attribution is satisfied at response time in the card that asked.
- **No weights collection.** Weight tracking is out of V2 entirely — it arrives with Health Connect in V3, where weigh-ins come from a scale rather than manual entry. This also removes weight-trend from V2's candidate stats.
- **Settings:** a single `/users/{uid}/settings/goal` doc (kcal target, plus macro targets if the goal screen has them) syncs, because the progress ring must agree across devices. Theme and language stay device-local (system defaults) — nothing else syncs; V1's dead `user_settings` table is not coming back.
- Security rules are the `/users/{userId}/{document=**}` UID-match pattern from `docs/research/firebase-backend-validation.md`.

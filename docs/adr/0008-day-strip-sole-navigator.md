---
status: accepted
---

# The Day strip is the sole day navigator

The main screen used to stack two day navigators: the chip row (then called the "week strip") and, below it, the **DayNav stepper** — prev/next arrows around a relative-date label with a "Today" anchor. They did the same job, so intent was muddy; worse, today stayed permanently ink-inverted even while you viewed another Day (so selection was ambiguous) and the horizontal swipe never fired. We retire the stepper and make the strip the only day navigator (#33).

Three decisions are load-bearing:

1. **Today-anchored 14-day window, not a fixed week.** The strip runs from 14 Days ago through today, plus exactly one dashed **frontier** Day beyond the selection. The window is anchored on *today* — a past selection only flags its chip and never slides the window; an on-strip future selection extends the window forward so one frontier always sits past it. This supersedes the fixed 7-day `weekWindow`; the pure axis (`src/lib/day.ts`) owns the window generator (`stripWindow`) and the off-strip predicate (`isOffStrip`), keeping every date edge unit-tested and DST-exact.
2. **One uniform selection treatment.** Selection is a single filled ink pill that travels between chips (the shared spring, ADR 0007); it applies to whichever Day is selected, today included. Today, when *not* selected, carries a soft outline ring (no fill) so it stays findable without ever looking selected. The prior "inverted-today + separate ring" split is dropped — exactly one Day ever reads as selected.
3. **Forward is deliberate, backward is free, deeper is the calendar's job.** Tapping the frontier selects it and reveals the next future Day (unbounded, one step at a time); dragging past the frontier is inert. Backward you free-scroll to the 14-Day floor and no further — Days older than that are reached through the calendar bottom sheet (#34), which also renders the off-strip date on the leading calendar button.
4. **The strip's reach is symmetric: 14 Days back, 14 Days forward (#34).** Navigation itself is unbounded in both directions — the calendar jumps anywhere and the swipe steps ±1 with no floor or ceiling — but a chip only ever represents a Day within 14 of today. Beyond that the selection is **off-strip**: no chip fills, the window collapses to its home state, and the calendar button carries the Day's date ("1 Jul"). Without the ceiling, a calendar jump months ahead would stretch the strip into a hundred chips; mirroring the floor keeps the "recent two weeks" mental model intact in both directions. The frontier beyond a ceiling selection still renders — stepping onto it simply lands off-strip.

The **swipe fix**: the gesture was dead because the log wrapper's default `touch-action` let the browser claim horizontal drags for panning and fire `pointercancel`, so `useDaySwipe` never saw the pointer-up. Setting `touch-action: pan-y` on the log surface (browser owns vertical scroll, we own horizontal gestures) revives it. The now-horizontally-scrollable strip sits *outside* the swipe surface so the two gestures never contend.

## Considered options

- **Keep both navigators** — rejected: the redundancy and the ambiguous permanent-today highlight are the whole reason for the ticket.
- **A window that follows the selection** — rejected: it makes "where is today?" unstable and fights the today-anchored mental model the axis already encodes.
- **A dedicated "Today" button** — rejected as chrome: within 14 Days you scroll to today's chip; beyond it you pick today in the calendar. No third control.
- **`preventDefault` on pointer-move to salvage the swipe** — rejected: it would also kill vertical scrolling of the log. `touch-action: pan-y` is the declarative, scroll-preserving fix.

## Consequences

- **Offline**: all navigation and Backfill within the strip work through the Firestore cache (ADR 0001); nothing here touches the Entry schema, deletes/undo, Goal, typeahead, or AI fill.
- **The calendar (#34)** lifted the 14-Day floor from the swipe (retiring `stepWithinStrip` — the swipe is plain `stepDay` now), added the calendar button + month-grid bottom sheet (`CalendarSheet`, always six rows so paging never changes the sheet's height), and renders off-strip Days on the button. The button lives *inside* the rail, past the oldest chip — scrolling to the end of the recent two weeks reveals it ("keep going further back"), no permanent chrome; off-strip the rail auto-scrolls to its leading end so the date-bearing button is in view. The grid speaks the strip's visual language: filled ink pill for the selection, outline ring for today, dots for logged Days (from the derived full-history index, ADR 0005).
- **Naming**: "week strip" is renamed "Day strip" across code (`DayStrip`), the glossary (CONTEXT.md), and the spec — the concept is 14 Days plus a moving frontier, not a week.

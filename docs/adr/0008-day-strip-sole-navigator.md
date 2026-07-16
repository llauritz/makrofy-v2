---
status: accepted
---

# The Day strip is the sole day navigator

The main screen used to stack two day navigators: the chip row (then called the "week strip") and, below it, the **DayNav stepper** — prev/next arrows around a relative-date label with a "Today" anchor. They did the same job, so intent was muddy; worse, today stayed permanently ink-inverted even while you viewed another Day (so selection was ambiguous) and the horizontal swipe never fired. We retire the stepper and make the strip the only day navigator (#33).

Three decisions are load-bearing:

1. **Today-anchored 14-day window, not a fixed week.** The strip runs from 14 Days ago through today, plus exactly one dashed **frontier** Day beyond the selection. The window is anchored on *today* — a past selection only flags its chip and never slides the window; a future selection extends the window forward so one frontier always sits past it. This supersedes the fixed 7-day `weekWindow`; the pure axis (`src/lib/day.ts`) owns the window generator (`stripWindow`) and the strip-bounded step (`stepWithinStrip`), keeping every date edge unit-tested and DST-exact.
2. **One uniform selection treatment.** Selection is a single filled ink pill that travels between chips (the shared spring, ADR 0007); it applies to whichever Day is selected, today included. Today, when *not* selected, carries a soft outline ring (no fill) so it stays findable without ever looking selected. The prior "inverted-today + separate ring" split is dropped — exactly one Day ever reads as selected.
3. **Forward is deliberate, backward is free, deeper is the calendar's job.** Tapping the frontier selects it and reveals the next future Day (unbounded, one step at a time); dragging past the frontier is inert. Backward you free-scroll to the 14-Day floor and no further — Days older than that are reached through the calendar bottom sheet (#34), which also renders the off-strip date. The floor lives in `stepWithinStrip` so the swipe and the scroll share it.

The **swipe fix**: the gesture was dead because the log wrapper's default `touch-action` let the browser claim horizontal drags for panning and fire `pointercancel`, so `useDaySwipe` never saw the pointer-up. Setting `touch-action: pan-y` on the log surface (browser owns vertical scroll, we own horizontal gestures) revives it. The now-horizontally-scrollable strip sits *outside* the swipe surface so the two gestures never contend.

## Considered options

- **Keep both navigators** — rejected: the redundancy and the ambiguous permanent-today highlight are the whole reason for the ticket.
- **A window that follows the selection** — rejected: it makes "where is today?" unstable and fights the today-anchored mental model the axis already encodes.
- **A dedicated "Today" button** — rejected as chrome: within 14 Days you scroll to today's chip; beyond it you pick today in the calendar. No third control.
- **`preventDefault` on pointer-move to salvage the swipe** — rejected: it would also kill vertical scrolling of the log. `touch-action: pan-y` is the declarative, scroll-preserving fix.

## Consequences

- **Offline**: all navigation and Backfill within the strip work through the Firestore cache (ADR 0001); nothing here touches the Entry schema, deletes/undo, Goal, typeahead, or AI fill.
- **The calendar ticket (#34)** lifts the 14-Day floor from the swipe, adds the leading calendar button + month-grid bottom sheet, and renders off-strip Days. `stripWindow`/`stepWithinStrip` are shaped for it: the window already extends forward, and the floor is a single guard to relax.
- **Naming**: "week strip" is renamed "Day strip" across code (`DayStrip`), the glossary (CONTEXT.md), and the spec — the concept is 14 Days plus a moving frontier, not a week.

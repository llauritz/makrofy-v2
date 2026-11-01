---
status: accepted
---

# Reminders are a rolling window of local one-shot notifications

Android gets optional Reminders to log (CONTEXT.md § Reminder): off by
default, one or more daily times, set up in the settings sheet, with a smart
skip that stays quiet once the user has logged. Everything runs on the device
through `@capacitor/local-notifications` — no server, no push.

> **The schedule is re-planned, not repeated.** `planReminders`
> (`src/lib/reminders.ts`, pure) turns the settings and today's Entries into
> one-shot notifications for the next 14 Days. `useReminderSync` (mounted in
> App) re-plans whenever the settings, the language, the Day or today's
> Entries change, and `applyReminderPlan` (`src/native/reminders.ts`, the only
> file that imports the plugin) cancels the reserved id range
> (41000–41999) and schedules the new window. A signature check skips the OS
> call when nothing changed.

## Why not one repeating alarm per time

A repeating alarm can't skip a single day, and the smart skip needs exactly
that: drop today's 13:00 reminder once lunch is logged. With one-shots, the
skip is just "leave today's occurrence out of the plan". The cost is that
Reminders run out if the app isn't opened for 14 Days — acceptable for an app
whose point is daily use, and each launch pushes the window forward. 6 times ×
14 Days is at most 84 alarms, far below Android's 500-per-app limit. The
plugin's boot receiver re-arms stored notifications after a restart.

## Smart skip only knows about today

The plan is computed when the app runs, from the Entries the app can see. So
the skip applies to today's remaining Reminders only; future Days are
scheduled in full and get their skip when the app next runs on that Day. An
Entry logged on another device skips a Reminder only once this device's
Firestore listener has seen it. The window for a Reminder runs from the
previous Reminder that day (or midnight) to the Reminder itself: "have you
logged since I last asked?"

## Inexact on purpose

Every notification is scheduled with `isExactNotification: false` and
`allowWhileIdle: true`. Exact alarms would send the user to the system "Alarms
& reminders" screen on first schedule and need `SCHEDULE_EXACT_ALARM`, which
Play restricts to alarm and calendar apps; a few minutes' drift is fine for
"log your lunch". The app manifest removes the plugin's exact-alarm
permission.

## Device-local settings

Settings are `{ enabled, times, smartSkip }` in one localStorage key
(`yaffle:reminders:v1`), not Firestore: a second phone, or the web app on the
same account, keeps its own. A corrupt value reads as off. The notification
permission (Android 13+) is requested only when the switch goes on; a refusal
keeps it off and explains how to allow it in system settings.

## Tapping a Reminder

The notification carries `extra.kind = "yaffle-reminder"`. App switches to
Main; Main jumps to today, closes its sheets and focuses the add card's label.
A tap that cold-starts the app is held by the plugin until the listener
attaches, and held again in `useReminders` until Main mounts.

---
status: accepted
---

# Health Connect: a one-way mirror of Entries out, weight in

The Android app (ADR 0012) talks to Health Connect in two independent
directions, each behind its own Settings toggle and its own permission:
"Send food to Health Connect" (`WRITE_NUTRITION`) and "Show weight from
Health Connect" (`READ_WEIGHT`). Nothing else is requested — no history, no
background reads, no other data types — which keeps the Play review to two
justified types (docs/research/health-connect-go-no-go.md).

> **Shape**: a small Kotlin plugin (`android/…/healthconnect/HealthConnectPlugin.kt`)
> that only translates, a typed wrapper (`src/native/health-connect.ts`) that is
> a no-op off Android, the pure sync rules (`src/lib/health-sync.ts`), and the
> runner plus device preferences (`src/data/health-connect.ts`). All decisions
> live in TypeScript, where they are tested; the plugin has none.

## Food out: one NutritionRecord per Entry

- **Keyed by the Entry id.** Each record's client record id is the Entry id,
  so an edit rewrites the same record and a delete removes it. The client
  record version is the device clock at write time, so the newest write from
  this phone always wins.
- **Fields.** `energy` = kcal; `protein`, `totalFat`, `totalCarbohydrate` in
  grams when the Entry has them; `name` = the label; `mealType` = the Entry's
  silent meal type (ADR 0003), `unknown` on Backfill.
- **Time.** An Entry logged on its own Day starts at its log time. A
  Backfilled Entry says nothing about the hour, so it starts at local noon of
  its Day, which keeps it inside that Day in any daily total. Every record
  spans one minute (Health Connect needs end after start).
- **Empty rows are not food.** A 0-kcal Entry with no macros (the dashed row
  waiting for its numbers) is not written, and its record is removed if an
  edit empties it.

### How writes happen: reconcile, not hooks

The runner does not hook `addEntry`/`updateEntry`/`deleteEntry`. It listens
to the full Entry history (the same listener the typeahead and stats use, so
no extra reads) and diffs every snapshot against a **ledger** — a device-local
map of Entry id → fingerprint of the record last written. Only the
difference reaches the plugin, batched after a short settle. This one path
covers everything that changes Entries: logging, editing, deleting, undo,
AI fills, imports, union merges, and edits made on another device or the web
while the phone app was closed (they are written the next time it opens).

- **Cache-only snapshots never delete.** A snapshot still served from the
  cache can be missing Entries (fresh install, another device's writes not yet
  pulled), so a missing Entry is only taken as deleted on a server-confirmed
  snapshot. A delete made offline therefore reaches Health Connect when the
  phone is next online.
- **Failures retry themselves.** A failed write stays out of the ledger, so the
  next snapshot plans it again. A revoked permission stops the runner and
  switches the toggle off, and Settings says why.
- **Launch is untouched.** The runner starts after the app renders, waits for
  the data to settle, and never blocks on Health Connect or the network.

### Which Entries are sent

Entries created after "Send food" was last switched on, plus any Entry this
device already wrote (so its edits and deletes keep following). History from
before the toggle is not sent: **only new entries**, the default while the
backfill question below is open.

Switching the toggle off stops writing; records already in Health Connect stay
there (the user can delete them in Health Connect). Switching it back on keeps
following the records written earlier.

The ledger is per profile. After a uid change (signing out to a fresh Guest, a
union merge into an account) it starts empty: nothing is deleted from Health
Connect, and a merged Entry keeps its id, so writing it again updates the
same record instead of duplicating it.

## Weight in: read on demand, cached

When "Show weight" is on, the stats screen paints the cached weigh-ins at once
and asks Health Connect again in the background each time it opens (90 days
back; Health Connect itself only releases data from 30 days before the first
grant without the history permission, so the window fills as the toggle stays
on). Weigh-ins from any app or scale count. The stats tile shows the latest
weigh-in, its change over 30 days and a daily sparkline. Weight is display
only: it is never written to Firestore, so it stays on the phone it came from.

## Everything here is per device

The toggles, the ledger and the weight cache live in localStorage, never in
Firestore. Health Connect is a store on one phone; a second phone or the web
app is not affected by what this one sends or shows.

## Open question

Should switching "Send food" on also send existing history (for example the
last 30 days) once? If so, the change is the eligibility rule in
`planNutritionSync` (`sinceMs`) and the value `enableHealthToggle` stores.

## Release checklist (Play Console)

- Complete the **Health apps declaration** for the two types: Nutrition (write:
  "Calories and macros the user logs are saved to Health Connect so other
  fitness apps can use them") and Weight (read: "Weigh-ins are shown next to
  calorie trends in Statistics").
- The **privacy policy** on the Play listing must be the one the in-app
  rationale screen opens (`https://goyaffle.web.app/privacy`, section on Health
  Connect).
- Update the **Data safety** form: weight read from Health Connect stays on
  the device and is never sent to Yaffle's servers; food sent to Health
  Connect is the same food log the form already declares.
- Re-submit the declaration whenever the set of Health Connect types changes.

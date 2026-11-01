---
status: accepted
---

# The home screen widget paints a snapshot the app hands it

Android home screen widgets can't be web views, so the widget is the one
piece of native UI in the Capacitor app (ADR 0012). It shows today's ring,
Remaining/Over, % of Goal and the macro totals in the summary card's look,
opens the app on today when tapped, and from its "+" opens it ready to type.

> **The widget snapshot** (`src/native/widget-snapshot.ts`): a small JSON
> object — today's face, the empty face of the next Day, and the Day it
> belongs to — with every number already summed and formatted, and every
> string already translated, by the web app. `WidgetSync`
> (`src/native/WidgetSync.tsx`) rebuilds it whenever today's Entries, the
> Goal or the language change and hands it to native code through the
> `YaffleWidget` plugin, which stores it in SharedPreferences and repaints.
> The widget (Jetpack Glance, `android/…/widget/`) reads nothing else.

## Why a snapshot

- **No second data path.** The widget never opens Firestore or the network.
  ADR 0001 keeps the SDK cache as the only store, and a native Firestore
  client (or a widget reading the WebView's IndexedDB) would be a second,
  divergent copy with its own auth. The snapshot is never the source of
  truth: like the boot mirror (ADR 0011), it is only the last picture.
- **One copy of the rules and the words.** Summing, the over-Goal cap,
  number formatting and the copy (both languages, following the in-app
  language setting rather than the phone's) stay in TypeScript, tested once
  (`tests/widget-snapshot.test.ts`). The Kotlin side only paints.
- **No extra reads.** `WidgetSync` holds its own today's-Day listener, a
  query the SDK already serves from the same cache and stream as the main
  screen's.

## Midnight without the app

The snapshot carries the next Day's face pre-built (the same Goal at zero),
so the widget can turn over on its own: whenever it paints, it compares the
snapshot's Day with the device's and shows the empty face once they differ.
An inexact alarm just after local midnight (no exact-alarm permission),
plus boot, app-update and clock or time-zone-change broadcasts, repaint it
and re-arm the alarm. Entries logged elsewhere on the new Day appear when the
app next runs, the same "local picture first" trade as the boot mirror.

## Looking like the app

Glance can't use custom fonts, so the face is drawn to bitmaps with static,
Latin-subset cuts of the app's Public Sans, Nunito and Fraunces
(`res/font`), using SummaryCard's measurements scaled as a whole to the
widget's size. Each colour is drawn as its own alpha mask and tinted with a
colour resource that has a night variant, so the launcher follows the
phone's light/dark switch without the app redrawing. The card and "+" button
are drawables on the same colour resources. The widget follows the phone's
theme, not the in-app override, as other widgets on the home screen do.

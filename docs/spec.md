# Makrofy V2 — build spec

The consolidated output of the [V2 wayfinder map](https://github.com/llauritz/makrofy-v2/issues/1) (all decisions 2026-07-10). Every section gists a locked decision and links where the full rationale lives — the ADRs in `docs/adr/`, the research notes in `docs/research/`, and the closed decision tickets. Domain vocabulary is normative in [CONTEXT.md](../CONTEXT.md) (Entry, Day, Goal, Guest, Suggestion, Frecency, AI fill, Flagged value, Source, Meal type, Backfill, Union merge).

**The prime directive: the app is easy.** Mobile-first, no onboarding ceremony, nothing interrupts logging food.

## Product

A one-person calorie/macro tracker. Screens:

- **Main**: header (Fraunces wordmark, sync indicator, settings) · week strip · add card · entry list · floating summary card (ink progress ring, Remaining, macro pills, stats button).
- **Statistics dashboard** (from the stats button) with a **week report subpage**; a **morning glance strip** appears on the main screen once per morning.
- **Onboarding**: one goal screen, prefilled, straight in.
- **Settings**: goal, theme, language, sign-in, install app, export/import.

## Stack

Vite SPA + PWA — React 19, TypeScript, Tailwind 4 (scaffold in place; no Next.js). Firebase: Firestore, Auth, Hosting, AI Logic (Gemini). Keep the build **Capacitor-wrappable** — no server-side rendering, standard web APIs — so the V3 Health Connect effort ([#8](https://github.com/llauritz/makrofy-v2/issues/8), `docs/research/health-connect-go-no-go.md`) can wrap it.

## Data & sync

Normative: **ADRs 0001–0006** (`docs/adr/`). Gist:

- **The Firestore SDK is the store** (ADR 0001): `persistentLocalCache` + multi-tab manager; no local DB, no custom sync layer. Offline use, queued writes, and last-write-wins come from the SDK. The service worker never caches Firestore traffic.
- **Entry schema** (ADR 0003), one flat collection `/users/{uid}/entries/{autoId}`:

  ```
  date:      'YYYY-MM-DD'   — device-local Day it counts toward
  label:     string         — the user's text; AI never rewrites it
  kcal:      number
  protein?, fat?, carbs?:   number (grams) — optional; most entries are kcal-only
  mealType:  'breakfast'|'lunch'|'dinner'|'snack'|'unknown'   — clock-derived on today, 'unknown' on Backfill, no UI (Health Connect hook)
  source:    'manual'|'history'|'ai'       — 'ai' drives the ✨ marker
  flagged?:  ('kcal'|'protein'|'fat'|'carbs')[] — values still unsure at commit; persists past commit
  createdAt, updatedAt: Timestamp (server)
  ```

- **Settings**: one synced `/users/{uid}/settings/goal` doc (the ring must agree across devices). Theme and language are device-local. Nothing else syncs.
- **Per-Day metadata sidecar** (ADR 0006): a `days` collection `/users/{uid}/days/{YYYY-MM-DD}` holds user-authored per-Day annotations — first field **Coverage**. A non-authoritative overlay: absence means no metadata, never no Day; stats still range-query Entries; it never holds cached aggregates.
- **Deletes are native** (ADR 0004): real document deletes, LWW, no tombstones; undo is an in-memory deferred delete.
- **Typeahead index is derived** (ADR 0005): built in memory from the entries listener; no history/favorites collection.
- **Security rules**: `/users/{userId}/{document=**}` UID-match (`docs/research/firebase-backend-validation.md`).
- **No weights collection** — weight tracking is out of V2 entirely (arrives scale-fed with Health Connect in V3).

## Identity

Normative: **ADR 0002**. Guest = Anonymous Auth minted silently on first launch (silent retry whenever the app opens without an identity; no designed first-run-offline UX). Google sign-in **links** onto the same UID; collision (account already has data) triggers an **automatic union merge** — copy-first, guest Entries batch-written into the existing account, existing settings win, no prompt. **Firebase's anonymous auto-cleanup must stay OFF** (load-bearing).

## Design direction — "Warm Market"

Normative: [#4](https://github.com/llauritz/makrofy-v2/issues/4) (full token spec + rationale); record screenshots `docs/design/v2-design-direction-{light,dark}.png`; reference implementation on branch `prototype/design-directions` (Variant B).

- **Type**: Fraunces Variable for the **wordmark only**; Public Sans Variable for everything else **including all numbers**. `tabular-nums` in lists/columns; proportional figures on hero numbers.
- **Surfaces** — light: bg `#f6f1e6` · card `#fffdf7` · ink `#2b2015` · muted `#7d7060` · border `#eee5d2` · input tint `#f3ecdd`; dark: bg `#17110c` · card `#2a211a` · text `#f3ece2` · muted `#a5988a` · border `#3a2f22` · input tint `#211a12`.
- **No accent hue**: primary CTA and the progress ring are ink. Shape: `rounded-full` pills, `rounded-2xl/3xl` cards.
- **Macro coding, fixed order P/F/C = blue/yellow/red** (CVD-validated). Marks light `#2f6bc4`/`#b8830a`/`#c03b2e`, dark `#5b91e4`/`#b98a20`/`#cf6152`; text-grade light `#2f6bc4`/`#96690a`/`#c03b2e`, dark `#5b91e4`/`#b98a20`/`#e07d6e`.
- **Conventions**: no entry times; 0-kcal entries dashed + muted; exactly one future day visible in the week strip (dashed + dimmed); ring is a plain single-hue kcal meter (segmented plate-ring rejected); both modes designed together; keep `color-scheme: light`/`dark` on `:root`/`.dark` in `src/index.css`.

## Motion — "space and fade"

Normative: **ADR 0007**. Tokens live in `src/screens/main/anim.ts`; the card primitive is `FadeSwap`.

- **The law (layout content):** motion means making space; appearing means fading. Boxes animate their **real size** (height — never a scale transform), neighbors **translate** to open/close the space, and content **fades in place**. No element both moves and fades.
- **Nothing ever stretches**: non-uniform scaling is banned everywhere, including Motion's layout-scale size interpolation — `layout` is only ever used as `layout="position"` (ADR 0007). Uniform scale stays legal (tap-shrink, ≤2 % enter/exit garnish).
- **Content swaps are fade-throughs**: old content fades out fast (~80 ms) at the old size → the box springs to the new size, **top edge anchored, growing downward**, pushing lower cards in lockstep → new content fades in (~150 ms) as the box settles. Cards above never move; no custom scrolling (the keyboard's scroll-into-view covers focused inputs).
- **Overlays** (undo snackbar, sheets) float above the layout, so space-making doesn't apply: they may enter with a directional slide + fade.
- **Indicators** (week-strip selection ring, summary arc) may **travel/sweep** — continuity is their message. Travel is only legal between same-size anchors; if anchors diverge in size it must degrade to a cross-fade.
- **Reduced motion**: `MotionConfig reducedMotion="user"` app-wide — movement snaps, fades remain.

## Add flow — "Inline fill"

Normative: [#5](https://github.com/llauritz/makrofy-v2/issues/5); screenshots `docs/design/v2-add-flow-*.png`; reference on branch `prototype/add-flow` (Variant A).

- **Only Add commits.** History picks and AI fills write into the form; nothing enters the day log except through Add.
- **One response zone below the P/F/C pills** inside the add card hosts everything reactive: history results, AI thinking, interpretation + flag help + attribution, question chips, hints.
- **Typeahead** (Suggestions): word-by-word sticky search (only the word being typed searches; previous results linger until new matches), min 2 chars/word, max 4 rows, frecency ranking (~3-week half-life decay), normalized-label dedup keeping freshest macros and summing counts. Rows: label, kcal, grams, ×use-count. Tap fills, never commits.
- **Everything animates — no sudden layout jumps** when zones appear/disappear. Standing requirement across the whole app; choreography in § Motion.

## AI macro-fill

Normative: [#3](https://github.com/llauritz/makrofy-v2/issues/3) + `docs/research/gemini-firebase-ai-logic-macro-fill.md` (schema, worked examples, pricing).

- **Model**: `gemini-3.5-flash` via Firebase AI Logic with Google Search grounding (owner escalated from `gemini-3.1-flash-lite` 2026-07-16; never 2.5 — no single-call grounded structured output, pricier grounding).
- **Four tiers**, one flat `status`-enum response: *confident* → fill · *unsure* → fill + 2px-dashed flagged fields (tap to accept/fix) · *ambiguous* → exactly one question with answer chips (chip = second and **final** round trip) · *hopeless* → refusal + usable hint.
- **The AI never rewrites the label**; interpretation shows in the info row; committed AI entries carry ✨ (`source: 'ai'`).
- **Two-speed conditional grounding**: staples ungrounded ~0.5 s, silent; branded/variable foods grounded 1.8–3.8 s and **must show the Google Search Suggestions chip** at response time (Google's terms — compliance). The heuristic is prompt design.
- **Safety**: App Check (reCAPTCHA Enterprise) enforced; AI button requires a Firebase identity (Guests count); per-user daily quota app-side; budget alert as backstop (alerts don't cap spend).
- **Offline**: AI button dims; tap shows "AI fill needs a connection" in the response zone. Manual entry and typeahead never wait on the AI.
- **Before building**: the SDK spike ([#20](https://github.com/llauritz/makrofy-v2/issues/20)) must confirm grounding + `responseSchema` on this exact model; fallback is the documented two-step.

## Stats

Normative: [#7](https://github.com/llauritz/makrofy-v2/issues/7); screenshots `docs/design/v2-stats-*.png`; reference on branch `prototype/stats` (Variant D).

- **Placement**: dashboard from the summary-card stats button; This-week tile opens the **week report subpage** (pill selector + swipe paging between 7-day windows); **morning glance strip** above the summary card on first open each morning (also hosts the Coverage label/revise chips when yesterday's Coverage ≠ Everything), dismissed by ✕ or the day's first log.
- **In**: this-week columns (dashed goal line) · 7-day average (+sparkline+delta) · *in range* (80–110% of Goal, dot row; gated behind ≥5 of 7 *assessable* days — Coverage Everything/unlabelled) · 30-day trend (daily tan line + 7-day ink line) · macro share stacked columns. **Out**: goal-difference bars, monthly calendar, streak, best day, weight trend.
- **Rules**: untracked days are gaps never zeros; averages over tracked days only; today is a lighter "now" bar, excluded until complete; future days get no marks; calorie charts monochrome ink (P/F/C hues reserved).
- **Coverage gates admission** (ADR 0006, CONTEXT.md): *Some* Days are excluded from every aggregate and drawn as a distinct marker (not a blank gap); *Most* Days count everywhere except the in-range measure and render approximate; *Everything*/unlabelled Days count fully. Coverage never scales a Day's numbers — its only lever is per-metric admission.

## PWA & offline

Normative: [#10](https://github.com/llauritz/makrofy-v2/issues/10).

- **Install**: quiet "Install app" settings entry (`beforeinstallprompt` native prompt on Chromium; iOS instruction sheet). No banners.
- **Icon**: Fraunces "M", ink on flour — standard, maskable, monochrome, apple-touch. Android splash from manifest `background_color: #f6f1e6`; per-mode `theme-color` `#f6f1e6`/`#17110c`; `display: standalone`.
- **Sync indicator**: silent (invisible when synced) / pending (offline + queued collapse into one; tap explains) / attention (auth-expired write pause only; tap re-auths). Fed by snapshot metadata.
- **Updates**: `vite-plugin-pwa` silent auto-update. Service worker precaches the app shell only.

## Deploy & environments

Normative: [#10](https://github.com/llauritz/makrofy-v2/issues/10) + `docs/research/firebase-backend-validation.md`.

- Canonical domain **`<project>.web.app`**; `authDomain` = serving domain with `/__/auth/handler` authorized (custom domain can layer on later).
- **GitHub Actions**: live channel on merge to `main`; preview channel per PR. `firebase.json`: SPA rewrite, immutable hashed assets, `no-cache` for `sw.js`/`manifest.webmanifest`/`index.html`.
- **One Firebase project**; local dev on the Emulator Suite (Auth + Firestore, never real data); AI calls gated by App Check debug tokens in dev; previews hit prod as throwaway guest UIDs.

## Onboarding & settings

One goal screen on first run, **prefilled 2000 kcal**, one tap into the app. Settings: goal edit · theme (system default, device-local) · language (device-local) · sign-in · install app · export/import.

## Export / import

V2 JSON only (`"format": "makrofy/2"`): all Entries (full schema) + Goal. Import previews new-vs-duplicate by Entry id, writes through the normal entries module. **No V1 support** — no V1 data survives and V2 carries zero V1 requirements ([#11](https://github.com/llauritz/makrofy-v2/issues/11)).

## i18n

Decided at spec time (swept from the map's fog): **en + es** (V1 parity), English the source of truth. Typed TS dictionary modules + a `t()` hook via a Language context — no i18n framework for a two-language app; a new language is one new module. Language device-local, defaults to browser language; dates/numbers via `Intl`.

## Cross-cutting build requirements

- **Everything animates; no layout jumps** — anywhere in the app, not just the add card. Vocabulary and choreography: § Motion.
- Dark and light designed together; verify every screen in both at 390×844.
- **Health Connect hooks** (cheap, honour now): `mealType` on every Entry, kcal + gram fields, nutrition authoritative in Firestore, Capacitor-wrappable build.
- **V1 failure classes not to repeat** (full catalog on the [map](https://github.com/llauritz/makrofy-v2/issues/1)): sync that drops deletes/swallows errors, materialized favorites drift, dubious stat definitions with NaN/timezone edges, future-nav asymmetry, inconsistent dark mode, missing PWA icons, decimal-vs-integer macro truncation.

## Out of scope for V2

Weight tracking · Health Connect implementation (V3 effort, own map) · classical favorites · keyboard shortcuts · V1 import · Supabase in any form.

## Build order

Wired with native GitHub issue dependencies; a ticket is takeable when everything blocking it is closed. Walking skeleton first — after ticket 04 the app is usable and deployable.

| # | Ticket | Blocked by |
|---|--------|------------|
| [#12](https://github.com/llauritz/makrofy-v2/issues/12) | 01 Provision Firebase + Google Cloud (human, console) | — |
| [#13](https://github.com/llauritz/makrofy-v2/issues/13) | 02 App shell: Warm Market tokens + static layout | — |
| [#14](https://github.com/llauritz/makrofy-v2/issues/14) | 03 Firestore store + Guest identity | #12 |
| [#15](https://github.com/llauritz/makrofy-v2/issues/15) | 04 Manual entry vertical slice (walking skeleton) | #13, #14 |
| [#16](https://github.com/llauritz/makrofy-v2/issues/16) | 05 Deploy pipeline: Hosting + GitHub Actions | #12, #13 |
| [#17](https://github.com/llauritz/makrofy-v2/issues/17) | 06 Onboarding goal screen + settings surface | #15 |
| [#18](https://github.com/llauritz/makrofy-v2/issues/18) | 07 History typeahead | #15 |
| [#19](https://github.com/llauritz/makrofy-v2/issues/19) | 08 Google sign-in, linking, union merge + sync indicator | #17 |
| [#20](https://github.com/llauritz/makrofy-v2/issues/20) | 09 Gemini SDK spike | #12 |
| [#21](https://github.com/llauritz/makrofy-v2/issues/21) | 10 AI macro-fill | #15, #20 |
| [#22](https://github.com/llauritz/makrofy-v2/issues/22) | 11 Stats: dashboard, week report, morning strip | #15 |
| [#23](https://github.com/llauritz/makrofy-v2/issues/23) | 12 PWA: manifest, icons, SW, install entry | #16 |
| [#24](https://github.com/llauritz/makrofy-v2/issues/24) | 13 Export / import | #17 |
| [#25](https://github.com/llauritz/makrofy-v2/issues/25) | 14 i18n: en + es | #17 |

# Health Connect integration — go/no-go for Yaffle V2

**Scope:** Can Yaffle (Vite SPA + PWA, Firebase/Firestore backend) integrate with Google Health Connect to READ body weight and WRITE calories/nutrition, and through what vehicle — Capacitor wrap, Flutter companion, or defer to V3?
**Date:** 2026-07-10

---

## TL;DR / recommendation

**Defer the actual integration to V3 — do NOT build it into the V2 PWA MVP — but keep a handful of cheap architecture hooks open now (see below). When it is built, pre-commit the vehicle to a Capacitor-wrapped Android build, with the Flutter companion as the fallback.**

The single most important reason to defer: **there is no web path to Health Connect, so every route forces you to ship and maintain a native Android app that must clear Google Play's full Health Connect review** — a mandatory permissions-declaration form, a matching public privacy policy, a completed Data Safety section, and a demonstrable in-app feature that uses each requested data type ([declare-access](https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access), [Play Console health permissions policy](https://support.google.com/googleplay/android-developer/answer/12991134?hl=en)). That is real product/legal overhead that should not gate shipping the PWA.

Why Capacitor over Flutter as the *chosen* vehicle (when built): the web app **is** the Android app — one codebase, one product surface, and wrapping a Vite build is a documented, trivial step ([Capacitor workflow](https://capacitorjs.com/docs/basics/workflow)). The Flutter route needs a whole second app plus a cross-app data path. The catch, and the main risk, is that **no maintained Capacitor plugin writes dietary `NutritionRecord`** today — so Capacitor means owning a small custom (or forked) native plugin for the nutrition-write bridge. If the team wants *zero* native code, switch to the Flutter companion, whose `health` package supports the exact operations out of the box.

---

## 1. Health Connect capabilities & data model

**`NutritionRecord`** is an interval record (has `startTime`/`endTime`). Its mandatory fields are `startTime`, `endTime`, `mealType`, and `metadata` ([data-types](https://developer.android.com/health-and-fitness/health-connect/data-types)). It carries **one energy field plus a large set of optional nutrient fields, all settable in a single record**. The official write example sets energy in kilocalories alongside many macros/micros at once:

```kotlin
val banana = NutritionRecord(
    name = "banana",
    energy = 105.0.kilocalories,
    dietaryFiber = 3.1.grams,
    potassium = 0.422.grams,
    totalCarbohydrate = 27.0.grams,
    totalFat = 0.4.grams,
    saturatedFat = 0.1.grams,
    sodium = 0.001.grams,
    sugar = 14.0.grams,
    vitaminB6 = 0.0005.grams,
    vitaminC = 0.0103.grams,
    startTime = startTime, endTime = endTime, ...
)
```
([write-data](https://developer.android.com/health-and-fitness/health-connect/write-data))

- **Energy** is an `Energy` unit (kilocalories or joules); **all nutrients** (protein, `totalCarbohydrate`, `totalFat`, saturated/unsaturated/mono/poly/trans fat, fiber, sugar, sodium, potassium, calcium, magnesium, iron, zinc, cholesterol, caffeine, vitamins A/B-complex/C/D/E/K, etc.) are `Mass` units ([data-types](https://developer.android.com/health-and-fitness/health-connect/data-types), [NutritionRecord reference](https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/NutritionRecord)).
- **`mealType` is mandatory** (breakfast/lunch/dinner/snack/unknown), so Yaffle must attach a meal type and a time window to every write.
- Calories + all macros go in **one** `NutritionRecord` — no need to split into multiple records.

**`WeightRecord`** is an instantaneous record. Mandatory fields: `time`, `weight`, `metadata`. `weight` is a `Mass` unit (kilograms, grams, pounds, etc.) ([data-types](https://developer.android.com/health-and-fitness/health-connect/data-types), [WeightRecord reference](https://developer.android.com/reference/androidx/health/connect/client/records/WeightRecord)).

**Permission model** — read and write are **separate, per-data-type** permissions declared in `AndroidManifest.xml` and requested at runtime:

- Nutrition: `android.permission.health.READ_NUTRITION` / `android.permission.health.WRITE_NUTRITION`
- Weight: `android.permission.health.READ_WEIGHT` / `android.permission.health.WRITE_WEIGHT`

Yaffle's stated needs (READ weight, WRITE nutrition) map to exactly two permissions: `READ_WEIGHT` + `WRITE_NUTRITION` ([data-types](https://developer.android.com/health-and-fitness/health-connect/data-types)). Runtime requests use `PermissionController.createRequestPermissionResultContract()` with `HealthPermission.getReadPermission(...)` / `getWritePermission(...)` ([get-started](https://developer.android.com/health-and-fitness/health-connect/get-started), [permissions UI](https://developer.android.com/health-and-fitness/health-connect/ui/permissions)).

- **Background reads need a separate permission.** Foreground reads work with the per-type read permission, but reading while the app is in the background requires the `FEATURE_READ_HEALTH_DATA_IN_BACKGROUND` capability, and reading data **older than 30 days** before the grant requires `PERMISSION_READ_HEALTH_DATA_HISTORY` ([get-started](https://developer.android.com/health-and-fitness/health-connect/get-started)). Yaffle's foreground READ-weight / WRITE-nutrition use case needs **neither**, which keeps the review scope minimal.

**Minimum version & distribution:**
- SDK supports Android 8 (API 26)+; apps that use it target Android 9 (API 28)+ ([get-started](https://developer.android.com/health-and-fitness/health-connect/get-started)).
- On **Android 14 (API 34)+**, Health Connect is a **built-in OS framework module — no install needed**. On **Android 13 and below**, it is a separate **APK from the Play Store** (`com.google.android.apps.healthdata`) ([get-started](https://developer.android.com/health-and-fitness/health-connect/get-started)).
- Current SDK: `androidx.health.connect:connect-client:1.2.0-alpha04` ([get-started](https://developer.android.com/health-and-fitness/health-connect/get-started)).

---

## 2. Google Play policy & review burden

Accessing Health Connect on a Play-distributed app is a **reviewed, gated** capability:

- **You must complete a health-apps permissions declaration** in Play Console for every publish that changes the set of Health Connect data types used — for new apps and updates alike. For each data type you must give "a clear and detailed justification explaining how your app uses the data to benefit the user," and request only the minimum types needed ([declare-access](https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access)).
- **Access must map to a real, user-facing feature.** "Only request permissions and access data types that support the specific, user-facing health features you offer. Don't request broader access than necessary." ([declare-access](https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access)).
- **Allowed use cases** include **Fitness & Wellness** — "apps designed to help users track, monitor, analyze, manage, and improve their physical fitness" — alongside Medical Care, Human-Subjects Research, Corporate Wellness/Rewards, and health-integrated Games ([Play Console health permissions policy](https://support.google.com/googleplay/android-developer/answer/12991134?hl=en)).
  - **Is Yaffle's use allowed?** Yes. `NUTRITION` and `WEIGHT` are standard declarable Health Connect data types ([data-types](https://developer.android.com/health-and-fitness/health-connect/data-types)), and a calorie/macro tracker is squarely a **Fitness & Wellness** app. The use-case list gates *app purpose*, not individual data types — there is no separate "nutrition write" or "weight read" allowlist to clear beyond declaring and justifying each type. (Note: an automated read of the policy page suggested nutrition/weight were "not explicitly permitted"; that is a misreading — the categories are purpose-based and a tracker qualifies.)
- **Privacy policy:** you must post a privacy policy on the Play listing, and it must be the **same** policy shown when users tap the privacy link inside Health Connect ([declare-access](https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access)).
- **Data Safety form:** you must complete Google Play's Data Safety section describing collection, sharing, and security ([declare-access](https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access)).
- **Prohibited uses** (relevant if Yaffle ever monetizes data): no selling/sharing health data with advertisers or data brokers; no use for credit/insurance/employment decisions; no "headless apps" ([Play Console health permissions policy](https://support.google.com/googleplay/android-developer/answer/12991134?hl=en)).

**Net:** the review is clearable for a genuine tracker, but it is a real gate — declaration + justification per type + public privacy policy + Data Safety + a working in-app feature. It cannot be faked and must be maintained across updates.

---

## 3. Distribution constraints

- **New apps must ship as Android App Bundles (AAB), and AAB requires Play App Signing** — mandatory for new apps since August 2021; Google holds/manages the app signing key ([AAB FAQ](https://developer.android.com/guide/app-bundle/faq), [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en)). This applies to whatever native artifact you ship (a Capacitor-wrapped app or a Flutter companion) if you distribute on Google Play.
- **Sideloading:** an AAB is only a *publishing* format; Android still installs APKs from any source, so the bundle requirement does not itself block sideloading ([AAB FAQ](https://developer.android.com/guide/app-bundle/faq)). Primary Google docs describe the Health Connect permissions review as a **Play-distribution policy gate**, not a documented runtime "must be installed from Play" check; a user-granted permission is what authorizes access at runtime ([declare-access](https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access)). Whether a fully sideloaded (non-Play) production app can exercise all granted Health Connect permissions on stock Android is **not something I could pin to a primary source** — see Open Questions.

---

## 4. Route 1 — Capacitor tooling maturity

**Wrapping the Vite SPA is trivial and well-documented.** Capacitor builds your web bundle, then `npx cap sync` copies the built `dist/` into a native Android WebView project; the `webDir` config points at the build output, and it "works with any modern web framework build output" including Vite ([Capacitor workflow](https://capacitorjs.com/docs/basics/workflow)). So the *shell* is not the risk — the **Health Connect plugin** is.

Community Capacitor Health Connect plugins surveyed:

| Plugin | Nutrition write? | Weight read? | Latest activity | Stars | Open issues | Verdict |
|---|---|---|---|---|---|---|
| [ubie-oss/capacitor-health-connect](https://github.com/ubie-oss/capacitor-health-connect) | **No** (NutritionRecord not in supported list) | Yes (r/w) | v0.7.0, Aug 2024 | ~8 | ~10 | Most-established generic HC plugin, but **missing the one type Yaffle must write**. |
| [devmaxime/capacitor-health-connect](https://github.com/devmaxime/capacitor-health-connect) | **Yes** (`NutritionRecord`) | **Yes** (`WeightRecord`) | ~9 commits, **no releases** | 0 | 0 | Covers the exact needs on paper, but **effectively abandoned/early**: no published releases, no adoption. Would require code review + self-maintenance/fork. |
| [Cap-go/capacitor-health](https://github.com/Cap-go/capacitor-health) | **No** — `calories`/`basalCalories`/`totalCalories` are energy **burned**, not dietary intake | Yes (r/w) | v8.9.1, Jul 2026 | ~20 | 0 | Most actively maintained, uses Health Connect, but **only calories burned** — no dietary `NutritionRecord`. |
| [mley/capacitor-health](https://github.com/mley/capacitor-health) | **No** | **No** (read-only, no weight) | v7.0.0, Aug 2025 | ~19 | ~3 | Read-only fitness metrics (steps/calories-burned/HR); not applicable. |

**Assessment:** the ecosystem's *maintained* plugins cover weight but **not dietary nutrition writing**. The only plugin that maps `NutritionRecord` is unmaintained. So Route 1 realistically means **owning a small native Kotlin plugin** — either forking `devmaxime` or writing ~15–30 lines against the documented `NutritionRecord`/`WeightRecord` Kotlin API ([write-data](https://developer.android.com/health-and-fitness/health-connect/write-data)). That is a bounded, one-time cost, but it is native maintenance you cannot avoid on this route today.

---

## 5. Route 2 — Flutter tooling maturity

The [`health`](https://pub.dev/packages/health) package (verified publisher **carp.dk / cph-cachet**) is the mature option:

- **Health Connect on Android: fully supported** (Google Fit support removed in v11.0.0 after Google's deprecation) ([pub.dev/packages/health](https://pub.dev/packages/health)).
- **Nutrition write: supported and comprehensive.** `writeMeal(...)` "Saves meal record into Apple Health or Health Connect" and accepts `mealType` (required) plus optional calories, protein, carbohydrates, total fat, fiber, caffeine, cholesterol, water, and a full set of vitamins/minerals ([writeMeal docs](https://pub.dev/documentation/health/latest/health/Health/writeMeal.html)). This maps directly onto Yaffle's WRITE-calories/nutrition need.
- **Weight read: supported** (`WEIGHT`, kilograms) on Android ([pub.dev/packages/health](https://pub.dev/packages/health)).
- **Health & popularity:** v13.3.1, ~672 likes, ~122k weekly downloads, MIT, last updated ~5 months ago ([pub.dev/packages/health](https://pub.dev/packages/health)). Far healthier than any Capacitor HC plugin.

**Effort of a minimal companion app:** the *bridge* logic is small (request permissions → read weight → write meals). The real cost is everything around it: a **separate Flutter codebase and Play listing**, its own Firebase Auth (Google) + Firestore access (`cloud_firestore`) to read the user's Yaffle nutrition/weight data, and a **second app the user must install**. The PWA stays untouched, which is the route's main appeal.

---

## 6. Architecture hooks for V2 now

Reasoning from the facts above: Health Connect wants **energy in kcal, macros in grams, a `mealType`, and per-entry timestamps** on nutrition, and **mass + timestamp** on weight; any future vehicle (wrapped app or companion) will read Yaffle's data and re-emit it in those shapes. So the cheap hooks are all about **making the Firestore data trivially mappable and reachable from a future native process** — no native work now.

### Cheap, do now (worth it)
1. **Store nutrition with Health-Connect-shaped fields:** energy in **kcal**, macros in **grams**, an explicit **meal-type enum** (breakfast/lunch/dinner/snack), and a **per-entry timestamp/time-window**. This is essentially free while designing the schema and yields a 1:1 map to `NutritionRecord` later — no migration ([data-types](https://developer.android.com/health-and-fitness/health-connect/data-types)).
2. **Store weight as a numeric mass + explicit unit + timestamp** (e.g. store kg canonically). Maps 1:1 to `WeightRecord`.
3. **Keep core nutrition/weight data authoritative in Firestore**, not in browser-only storage (IndexedDB/localStorage/OPFS) as the source of truth — so a Capacitor plugin or a Flutter companion can read the same records via the Firebase SDK/backend.
4. **Keep the web build Capacitor-wrappable:** configurable API base URL, relative asset paths, no hard dependency on being served from one specific origin, and don't route *core* flows through browser-only APIs (Web Bluetooth, service-worker-only behavior). This aligns with PWA best practice anyway ([Capacitor workflow](https://capacitorjs.com/docs/basics/workflow)).
5. **Use Firebase Auth (Google) as identity** so any future native vehicle reuses the same account/session — already the V2 plan.

### Not worth it now (speculative)
1. **Adding Capacitor/Flutter scaffolding or writing the plugin** — zero user value before V3, and the tooling/policy will keep moving.
2. **Building a background-sync engine or requesting history/background permissions** — the foreground READ-weight/WRITE-nutrition case needs neither `READ_HEALTH_DATA_HISTORY` nor background-read; don't design for them speculatively ([get-started](https://developer.android.com/health-and-fitness/health-connect/get-started)).
3. **Designing a bespoke companion-app data API/contract** — the Firestore schema *is* the contract; a separate one is premature.
4. **Modeling micronutrients the product doesn't collect** — Health Connect supports dozens of nutrients; only persist what the UI actually captures.
5. **Standing up AAB/Play App Signing or a second Play listing** — no artifact to distribute yet.

---

## Route comparison table

| Dimension | **Route 1: Capacitor wrap** | **Route 2: Flutter companion** | **Route 3: Defer to V3** |
|---|---|---|---|
| **Effort** | Low to wrap the Vite SPA; **medium** because of the nutrition-write gap (own/fork a native plugin) | Bridge logic is small, but a **whole second app** + Firebase auth/Firestore re-integration + second Play listing | None now |
| **Tooling maturity** | Weak for the core need — **no maintained plugin writes `NutritionRecord`**; only unmaintained `devmaxime` does | **Strong** — `health` package `writeMeal` covers nutrition; weight read supported; 122k weekly downloads, verified publisher | N/A |
| **Maintenance** | One shared web codebase + a small native plugin you own | **Two codebases** (PWA + Flutter) and a cross-app data path to keep in sync | None |
| **Distribution / review** | Full Play Health Connect review; AAB + Play App Signing | **Same** review + AAB + Play App Signing, on a second listing | None |
| **Fit with a Firestore PWA** | **High** — the web app *is* the Android app; Firestore/auth reused directly | Medium — companion must separately read Firestore and re-auth; user installs two apps | High (unchanged) |
| **Risk** | Owning native HC plugin code (bounded, well-documented API) | Product fragmentation, two-app UX, double the mobile surface to maintain | Opportunity cost only |

---

## Open questions / unknowns (not settled from primary sources)

1. **Sideloaded/non-Play production apps + Health Connect:** primary Google docs frame the permissions review as a Play-distribution policy, not a documented runtime gate, but I found **no primary source** explicitly confirming a fully sideloaded production app can exercise all granted Health Connect permissions on stock Android. Secondary sources claim a production application-ID check; a de-Googled-ROM edge case (GrapheneOS) can break the permission UI entirely. **Test on-device before relying on any non-Play distribution.**
2. **Play review turnaround / approval rate** for a nutrition+weight fitness app — Google does not publish a primary SLA.
3. **`health` package field mapping fidelity:** the docs list the `writeMeal` fields but not exactly how each maps into a single Health Connect `NutritionRecord` or whether units round-trip precisely — verify with a device test before committing to Route 2.
4. **`devmaxime` Capacitor plugin correctness:** it advertises `NutritionRecord` + `WeightRecord`, but with no releases and no adoption its real coverage/quality is unverified — code review required before forking.
5. **Exact `MealType`/nutrient enum parity** between whatever library you pick and Health Connect's own enums — confirm at implementation time.

---

## Sources

- Health Connect — data types: https://developer.android.com/health-and-fitness/health-connect/data-types
- Health Connect — write data (NutritionRecord/WeightRecord examples): https://developer.android.com/health-and-fitness/health-connect/write-data
- Health Connect — get started (versions, distribution, permissions, background/history): https://developer.android.com/health-and-fitness/health-connect/get-started
- Health Connect — permissions & data access UI: https://developer.android.com/health-and-fitness/health-connect/ui/permissions
- `NutritionRecord` API reference: https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/NutritionRecord
- `WeightRecord` API reference: https://developer.android.com/reference/androidx/health/connect/client/records/WeightRecord
- Publish on Google Play — declare Health Connect access (declaration form, privacy policy, Data Safety): https://developer.android.com/health-and-fitness/guides/health-connect/publish/declare-access
- Play Console — Android Health permissions guidance & FAQs (allowed use cases, prohibited uses): https://support.google.com/googleplay/android-developer/answer/12991134?hl=en
- Android App Bundle FAQ (AAB mandatory for new apps): https://developer.android.com/guide/app-bundle/faq
- Play App Signing (mandatory, Google-managed key): https://support.google.com/googleplay/android-developer/answer/9842756?hl=en
- Capacitor workflow (wrapping a web/Vite build into a WebView): https://capacitorjs.com/docs/basics/workflow
- Capacitor plugin — ubie-oss/capacitor-health-connect: https://github.com/ubie-oss/capacitor-health-connect
- Capacitor plugin — devmaxime/capacitor-health-connect: https://github.com/devmaxime/capacitor-health-connect
- Capacitor plugin — Cap-go/capacitor-health: https://github.com/Cap-go/capacitor-health
- Capacitor plugin — mley/capacitor-health: https://github.com/mley/capacitor-health
- Flutter `health` package (pub.dev): https://pub.dev/packages/health
- Flutter `health` — `writeMeal` API docs (nutrition fields): https://pub.dev/documentation/health/latest/health/Health/writeMeal.html

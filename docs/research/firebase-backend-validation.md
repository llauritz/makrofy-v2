# Firebase Backend Validation — Yaffle V2

_Research date: 2026-07-10. Validating Firebase (Firestore + Google OAuth auth + Firebase Hosting) as the sync backend for a mobile-first, single-user-per-account calorie/macro tracker rebuilt as a Vite SPA + PWA. All claims below are from primary sources (official Firebase / Google Cloud docs, the Firebase JS SDK docs, vite-plugin-pwa docs, and MDN/web-platform specs), cited inline._

---

## Fit verdict: **GO**

Firebase is a good fit as the sync backend, and it specifically fixes the failure mode that killed V1.

**The deciding question — does Firebase's free (Spark) tier have any Supabase-style inactivity/pause/auto-deletion mechanism? No.** No primary Firebase or Google Cloud document describes pausing, dormancy, or automatic deletion of a Firestore database or project due to inactivity. The only time-based consequence documented for the Spark plan is that if you exceed a product's no-cost quota **in a calendar month**, that product is "shut off for the remainder of that month" and resumes at the next monthly reset ([Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)) — a usage cap, not a deletion, and it self-heals. A tiny single-user food log will never approach the quotas.

**Caveats (none apply to an actively-used app):** (1) A Google Cloud project can be *suspended* for Terms-of-Service / Acceptable-Use-Policy violations, and a project suspended for 9+ months is then marked for deletion — but the trigger is a violation, not inactivity ([Project suspension guidelines](https://docs.cloud.google.com/resource-manager/docs/project-suspension-guidelines)). (2) An *orphaned* project (one with **no owner** — e.g. every owner's Google account was closed) can be marked for deletion, but any API activity or a linked billing account exempts it (same source). (3) The "Unattended Project Recommender" is **organization-scoped and advisory only** — it never applies to a standalone consumer project and never deletes anything automatically ([Unattended project recommender](https://docs.cloud.google.com/recommender/docs/unattended-project-recommender)). Keep the owning Google account alive and there is no deletion path.

Net: go. The remaining items below are design constraints, not blockers.

---

## 1. Free (Spark) tier fit

### Quotas vs. the workload
Current Cloud Firestore Spark (no-cost) quotas ([Usage and limits | Firestore](https://firebase.google.com/docs/firestore/quotas), page updated 2026-07-08; cross-checked against [Firebase Pricing](https://firebase.google.com/pricing)):

| Resource | Spark free quota |
|---|---|
| Stored data | **1 GiB total** |
| Document reads | **50,000 / day** |
| Document writes | **20,000 / day** |
| Document deletes | **20,000 / day** |
| Outbound (egress) data transfer | **10 GiB / month** |

Hard limits that matter for the data model: **max document size 1 MiB (1,048,576 bytes)**; max field value size 1 MiB − 89 bytes; max API request 10 MiB ([Firestore quotas](https://firebase.google.com/docs/firestore/quotas)). Firebase Hosting on Spark: **10 GB storage, 360 MB/day transfer** ([Firebase Pricing](https://firebase.google.com/pricing)).

A single-user daily food log generates on the order of tens of reads/writes per day — three to four orders of magnitude under the 50K read / 20K write daily ceilings, and a lifetime of entries stays far under 1 GiB. **The Spark tier is comfortably sufficient with no realistic risk of hitting a cap.**

Note: "Cloud Firestore allows **exactly one free database per project**. The first database you create qualifies for the free quota" ([Firestore quotas](https://firebase.google.com/docs/firestore/quotas)) — use the single default database; do not create extra named databases expecting free quota.

### Inactivity / pause / auto-deletion policy — the decisive question
**Finding: there is no inactivity-based pause or deletion mechanism on the Spark plan or the underlying Google Cloud project.** Evidence, from primary sources:

- **Firebase pricing plans** ([source](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), updated 2026-07-03) describes the Spark plan as "Full usage of no-cost Firebase products" with "No-cost usage quota for paid Firebase products," and the *only* consequence text is: _"If you exceed the no-cost quota limit in a calendar month for any product, your project's usage of that specific product will be shut off for the remainder of that month."_ There is **no mention** of inactivity, dormancy, pausing, or auto-deletion anywhere on the page. Exceeding quota is a monthly, self-resetting cap — not deletion, and unreachable at this scale.
- **Firebase FAQ** ([source](https://firebase.google.com/support/faq)) contains **no** inactivity/dormant-project/auto-deletion policy.
- **Google Cloud project suspension guidelines** ([source](https://docs.cloud.google.com/resource-manager/docs/project-suspension-guidelines)): suspension causes are **Terms-of-Service / Acceptable-Use-Policy violations**, not inactivity. It does say _"If a Project resource is suspended for more than nine months, it is marked for deletion"_ — but this is nine months **after a violation-driven suspension**, not after inactivity. Separately, an **orphaned** project is defined as one that _"does not have an owner, regardless of whether they are active or suspended"_ (i.e. all owner Google accounts were deleted). An orphaned project is spared immediate deletion if it meets any of: _"It has some API activity that is reflected in the logs," "It is linked to a Cloud Billing account," "It has a live App Engine app,"_ or it is owned by an organization. An actively-used app trivially satisfies the API-activity criterion.
- **Unattended Project Recommender** ([source](https://docs.cloud.google.com/recommender/docs/unattended-project-recommender)): _"can be used only for projects assigned to Google Cloud organizations."_ It is **advisory** ("recommendations to turn down projects" / "assign a new owner") and performs **no automatic deletion**. It does not apply to a standalone consumer Firebase project.
- **Deletion is a deliberate action with a grace period**: shutting down a project _"immediately moves the project into a 30-day recovery period"_ and can be restored within that window ([Delete and restore projects](https://docs.cloud.google.com/resource-manager/docs/delete-restore-projects)). Deleting a Firestore database is likewise a manual action ([Firestore quotas](https://firebase.google.com/docs/firestore/quotas)).

**Conclusion:** Unlike Supabase's free tier (which pauses/removes projects after inactivity), Firebase has **no analogous inactivity failure mode**. The only ways to lose the project are: you manually delete it, you violate the ToS/AUP, or the owning Google account ceases to exist (orphaning). Keeping the account active and the app in use eliminates all of these.

---

## 2. Firestore offline persistence in an installable PWA (Firebase JS SDK v9+ modular)

Primary source: [Access data offline | Firestore](https://firebase.google.com/docs/firestore/manage-data/enable-offline).

### Enabling persistence (modular SDK)
Configure the cache when you create the Firestore instance via `initializeFirestore` (not `getFirestore`), passing `persistentLocalCache`:

```js
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
```

### Tab managers and multi-tab behavior
- **`persistentSingleTabManager` is the default.** With single-tab persistence, IndexedDB persistence can only be held by **one tab at a time**; a second tab/window attempting to enable it will fail (documented error: "persistence can only be enabled in one tab at a time").
- **`persistentMultipleTabManager`** enables shared IndexedDB persistence **across multiple tabs with automatic synchronization** ([enable-offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline)). Because an installed PWA can legitimately be open in more than one window/tab, use the multiple-tab manager to avoid the single-tab failure.

### Cache size / storage limits
- Default persistent cache threshold is **100 MB**; configurable via `cacheSizeBytes` with a **minimum of 1 MB**. Set `CACHE_SIZE_UNLIMITED` to disable automatic clean-up. Garbage collection of stale documents is automatic once the threshold is exceeded ([enable-offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline)). For a tiny food log the default 100 MB is far more than enough; unlimited is unnecessary.

### Offline behavior and how long fully-offline use is safe
- While offline, you can **read, write, listen, and query against cached data**; snapshots carry `snapshot.metadata.fromCache`, and on reconnect the SDK syncs local changes to the backend with **last-write-wins** conflict resolution ([enable-offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline)).
- **Auth is the real long-offline limit, not Firestore.** Firebase Auth "keeps a local cache of sign-in data, allowing a previously signed-in user to remain authenticated even when they're offline" ([Use Firebase in a PWA](https://firebase.google.com/docs/web/pwa)). ID tokens are short-lived (**~1 hour**) but refresh tokens are long-lived and only revoked on major account changes ([Manage user sessions](https://firebase.google.com/docs/auth/admin/manage-sessions)). The documented offline risk: if the auth token expires while offline, the client **pauses write operations until the app can re-authenticate**, otherwise writes could be rejected by security rules ([Firebase offline capabilities docs](https://firebase.google.com/docs/database/android/offline-capabilities)). Practically: reads and locally-queued writes keep working offline; those queued writes flush once connectivity + token refresh succeed. I could **not** find a documented hard numeric cap on the number of buffered offline writes — the queue is bounded by IndexedDB/cache size, not a stated count.

### Interaction with a service worker
- Firestore's offline persistence uses its **own IndexedDB store**, which is **separate from** the service worker's Cache Storage. The Firebase PWA doc frames them as complementary: Firestore handles the data layer offline, and the service worker is for caching **static assets** ("Combined with Service Workers to cache your static assets, your PWA can fully function offline") ([Use Firebase in a PWA](https://firebase.google.com/docs/web/pwa)).
- **The service worker should not attempt to cache Firestore's network traffic or its IndexedDB.** No documented interference exists between SW asset caching and Firestore's IndexedDB, because they use different storage mechanisms. Let Firestore own its IndexedDB; let the SW own precached app-shell assets.

---

## 3. Security rules for strict per-user data isolation

Primary source: [Firestore Security Rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions) (page updated 2026-07-08).

Canonical "each user reads/writes only their own documents" pattern, keyed on the authenticated UID in the path:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```

- **Require authentication** with `request.auth != null`; the per-user check is `request.auth.uid == userId`, where `userId` is the path segment ([rules-conditions](https://firebase.google.com/docs/firestore/security/rules-conditions)). The docs' own example uses `allow read, update, delete: if request.auth != null && request.auth.uid == userId; allow create: if request.auth != null;`.
- **Pitfall — rules are not filters.** _"Cloud Firestore security rules evaluate each query against its potential result and fails the request if it could return a document that the client does not have permission to read."_ ([rules-conditions](https://firebase.google.com/docs/firestore/security/rules-conditions)). A query that could match documents the user can't read is **rejected outright** — it does not silently return a filtered subset. Client queries must therefore be constrained so their results are always within the allowed set (which the `/users/{uid}/...` path structure guarantees, since every query is naturally scoped under the user's own subtree).

---

## 4. Firebase Hosting as the deploy target for a Vite SPA

### SPA rewrite
In `firebase.json`, rewrite all routes to the SPA entry point ([Configure Hosting behavior](https://firebase.google.com/docs/hosting/full-config)):

```json
{
  "hosting": {
    "public": "dist",
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ]
  }
}
```
(`"public": "dist"` because Vite builds to `dist/`.) `firebase init hosting` offers a "configure as a single-page app" option that adds this rewrite automatically.

### Service-worker / vite-plugin-pwa cache-header friction
- Firebase Hosting **automatically caches static content on its CDN** and **purges the CDN on every redeploy** ([Manage cache behavior](https://firebase.google.com/docs/hosting/manage-cache), updated 2026-07-03). Dynamic (rewritten-to-backend) content defaults to `Cache-Control: private`. **I could not find an explicit documented default `max-age` value** that Hosting stamps on static files that ship without their own `Cache-Control` header — so the safe approach is to set headers explicitly rather than rely on the default.
- To force freshness, set headers in `firebase.json`. The docs' own example ([Manage cache behavior](https://firebase.google.com/docs/hosting/manage-cache)):
```json
"headers": [
  { "source": "/posts/**",
    "headers": [ { "key": "Cache-Control", "value": "no-cache, no-store" } ] }
]
```
- **vite-plugin-pwa's deployment guidance is explicit**: _"Double check that you do not have caching features enabled, especially `immutable`, on locations like: `/`, `/sw.js`, `/index.html`, `/manifest.webmanifest`"_ ([Vite PWA — Deployment](https://vite-pwa-org.netlify.app/deployment/)). Keep the cache lifetime of these "as low as possible if not hashed files." Vite's hashed asset filenames (e.g. `assets/*.[hash].js`) are safe to cache long/immutable; the service worker, manifest, and app-shell HTML must be served no-cache / short max-age so a new deploy propagates.
- **Mitigating web-platform fact:** browsers already treat the service worker *script* specially. `ServiceWorkerRegistration.updateViaCache` defaults to `"imports"`, meaning _"the HTTP cache is not consulted for updates to the service worker script"_ (only for `importScripts()` imports) ([MDN: updateViaCache](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/updateViaCache)). So even a mis-set long cache header on `sw.js` won't fully block SW update checks — but the **manifest and `index.html` are not covered by this**, so setting `no-cache` on them explicitly is still required.

Concrete recommended `firebase.json` headers:
```json
"headers": [
  { "source": "**/*.@(js|css|woff2|png|svg|webp)",
    "headers": [ { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" } ] },
  { "source": "/@(sw.js|service-worker.js|manifest.webmanifest|index.html)",
    "headers": [ { "key": "Cache-Control", "value": "no-cache" } ] }
]
```
(Long-cache the Vite content-hashed assets; no-cache the SW / manifest / entry HTML.)

---

## 5. Google auth in a mobile standalone PWA

### `signInWithPopup` vs `signInWithRedirect`
- The Google sign-in guide states: **"The redirect method is preferred on mobile devices."** Popup uses `signInWithPopup(auth, provider)`; redirect uses `signInWithRedirect(auth, provider)` followed by `getRedirectResult(auth)` on page reload ([Authenticate Using Google with JavaScript](https://firebase.google.com/docs/auth/web/google-signin)).
- However, popup carries its own caveat, per Firebase: _"popups are occasionally blocked by the device or platform, and the flow is less smooth for mobile users"_ ([redirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices)).

### The known redirect breakage (third-party storage blocking)
Primary source: [Best practices for using signInWithRedirect on browsers that block third-party storage access](https://firebase.google.com/docs/auth/web/redirect-best-practices) (updated 2026-07-03).

- Firebase Auth's redirect flow _"uses a cross-origin iframe that connects to your app's Firebase Hosting domain. However, this mechanism doesn't work with browsers that block third-party storage access."_ When the app is served from one domain and the auth helper lives on `*.firebaseapp.com`, that iframe is third-party and gets blocked.
- Timeline / scope: _"Starting June 24 2024, implementing one of the options will be required for redirect sign-in to work on Google Chrome M115+. This is already required on Firefox 109+ and Safari 16.1+."_ (i.e. Safari ITP and Chrome storage partitioning are the culprits, and this is now in force for all mainstream browsers).
- **Official fix, by hosting setup:**
  - Hosted on a **`*.firebaseapp.com` subdomain → not affected, no action needed** (app and auth iframe share the domain).
  - Hosted on a **`*.web.app` subdomain or a custom domain → apply "Option 1": set the Firebase config `authDomain` to your own serving domain** (and add that domain's `/__/auth/handler` to the OAuth provider's authorized URIs, then redeploy) so the app and the auth iframe are same-origin.
  - Hosted **outside Firebase → self-host the auth helper via a reverse proxy** forwarding `https://<app-domain>/__/auth/` to `https://<project>.firebaseapp.com/__/auth/`, or other listed options.
  - **Or** switch to `signInWithPopup()`, which sidesteps the third-party-storage dependency (at the cost of the popup caveats above).

### Standalone display-mode (installed PWA) specifics
- I could **not** find a primary Firebase doc giving explicit, standalone-`display`-mode-specific popup/redirect behavior for an installed PWA — flagging this honestly rather than guessing. What the primary sources *do* establish and that governs the decision: (a) redirect is preferred on mobile but is broken by third-party-storage blocking unless the auth iframe is same-domain as the app; (b) popup avoids that but can be blocked and is rougher on mobile.
- **Practical resolution from the primary facts:** deploy on Firebase Hosting and make the auth iframe same-domain — either serve from the `*.firebaseapp.com` subdomain (zero-config, "not affected") or set `authDomain` to your `web.app`/custom domain (Option 1). Then `signInWithRedirect` works reliably in the installed PWA and returns cleanly into the PWA context after redirect. Keep `signInWithPopup` as the fallback if popup UX is acceptable on the target devices.

---

## Constraints the data-model & sync design must respect

- **Top-level `/users/{uid}` collection with all of a user's data nested underneath**, so a single security rule (`match /users/{userId}/{document=**}` with `request.auth != null && request.auth.uid == userId`) isolates every user and every query is naturally scoped to the caller's own subtree.
- **Design queries to be self-scoping** — rules are *not* filters; a query that could touch documents outside the user's allowed set is rejected outright, not filtered. Nesting everything under `/users/{uid}/...` guarantees this.
- **Store each food-log entry as its own document keyed/grouped by day** (e.g. `/users/{uid}/days/{yyyy-mm-dd}/entries/{entryId}` or `/users/{uid}/entries/{id}` with a `date` field). Keep documents well under the **1 MiB** per-document limit — do not accumulate a whole day/month into one giant document.
- **Initialize Firestore with `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`** — an installed PWA can open multiple windows, and the single-tab default would fail the second window. Default 100 MB cache is fine; no need for `CACHE_SIZE_UNLIMITED`.
- **Use the single default Firestore database** (only one free database per project qualifies for the no-cost quota).
- **Treat Firestore's IndexedDB persistence and the service worker's Cache Storage as separate layers** — the service worker precaches the app shell / static assets only; it must **not** cache Firestore API traffic or its IndexedDB.
- **`firebase.json` must set explicit cache headers:** long/`immutable` cache for Vite's content-hashed assets, but **`Cache-Control: no-cache` for the service worker file, `manifest.webmanifest`, and `index.html`** so deploys propagate (per vite-plugin-pwa guidance).
- **`firebase.json` needs the SPA rewrite** `{ "source": "**", "destination": "/index.html" }` (public dir = `dist`).
- **Make the Firebase Auth iframe same-domain as the app** to keep `signInWithRedirect` working under Safari ITP / Chrome storage partitioning: either serve from the `*.firebaseapp.com` subdomain, or set `authDomain` to your `web.app`/custom domain (Option 1: also authorize that domain's `/__/auth/handler` in the OAuth client). Have `signInWithPopup` as a fallback.
- **Plan for the offline auth-token edge case:** offline reads and queued writes work, but if the ID token expires while offline the client pauses writes until it can re-authenticate; the UI should tolerate a re-auth/sync-pending state after long offline periods rather than assume writes always flush instantly.
- **Keep the owning Google account and project alive** — there is no inactivity deletion, but the project *can* be lost if the owning account is closed (orphaning) or on a ToS/AUP violation. No special "keep-alive" traffic is needed; normal use is sufficient.

---

## Sources (all primary)

**Firebase — pricing & quotas**
- Firebase pricing plans — https://firebase.google.com/docs/projects/billing/firebase-pricing-plans (updated 2026-07-03)
- Usage and limits | Firestore (quotas) — https://firebase.google.com/docs/firestore/quotas (updated 2026-07-08)
- Firebase Pricing (Spark/Blaze quota table) — https://firebase.google.com/pricing
- Firebase FAQ — https://firebase.google.com/support/faq

**Google Cloud — project lifecycle / deletion**
- Project suspension guidelines — https://docs.cloud.google.com/resource-manager/docs/project-suspension-guidelines
- Unattended project recommender — https://docs.cloud.google.com/recommender/docs/unattended-project-recommender
- Delete and restore projects — https://docs.cloud.google.com/resource-manager/docs/delete-restore-projects

**Firestore — offline persistence & rules**
- Access data offline | Firestore — https://firebase.google.com/docs/firestore/manage-data/enable-offline
- Firestore Security Rules conditions — https://firebase.google.com/docs/firestore/security/rules-conditions (updated 2026-07-08)
- Use Firebase in a progressive web app (PWA) — https://firebase.google.com/docs/web/pwa (updated 2026-07-03)

**Firebase Auth**
- Authenticate Using Google with JavaScript — https://firebase.google.com/docs/auth/web/google-signin
- Best practices for signInWithRedirect (third-party storage) — https://firebase.google.com/docs/auth/web/redirect-best-practices (updated 2026-07-03)
- Manage user sessions — https://firebase.google.com/docs/auth/admin/manage-sessions
- Firebase offline capabilities (auth-token-expiry-while-offline behavior) — https://firebase.google.com/docs/database/android/offline-capabilities

**Firebase Hosting**
- Configure Hosting behavior (rewrites/headers) — https://firebase.google.com/docs/hosting/full-config
- Manage cache behavior — https://firebase.google.com/docs/hosting/manage-cache (updated 2026-07-03)

**vite-plugin-pwa & web platform**
- Vite PWA — Deployment (cache headers for sw/manifest/shell) — https://vite-pwa-org.netlify.app/deployment/
- MDN — ServiceWorkerRegistration.updateViaCache — https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/updateViaCache

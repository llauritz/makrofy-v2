---
status: accepted
---

# A failed AI fill is reported by the phone and triaged on the server

AI fill calls Gemini straight from the phone (Firebase AI Logic, ADR 0010),
so Google's logs show only that a request failed, and our own server never
sees the request at all. To know whether a failure needs a fix from us or is
Google's to sort out, the phone tells us.

> **The failure report** `/aiFailures/{auto id}`:
> `{ uid, at, blame, kind, code, status, reason, finishReason, message, model,
> online, ms, final, expireAt }`. Written only by the `reportAiFailure`
> callable; no client can read or write the collection.
>
> **The window summary** `/aiHealth/{window start, ISO}`: counts per blame and
> kind, distinct users, the verdict and its alert lines, matching incidents on
> Google's status pages, and the paying users who were hit. Written by the
> `aiFillHealth` schedule every 15 minutes, only for windows with failures.

## Decisions

- **Facts only, never the food.** The report carries the error's code, HTTP
  status, Google's reason, the finish reason, a cut message, timing and the
  model. The text the user typed stays out, so the report is technical data,
  not food-log data (privacy policy § 2).
- **Classified on the server** (`functions/src/ai-failure.ts`), from the raw
  facts, so a new rule applies to old app versions too. Four blames: *ours*
  (bad request, retired model, our quota, a reply our parser rejects, a crash
  or stale chunk in our code), *google* (5xx, overload, timeouts, blocked
  replies), *device* (no connection, App Check refusing one phone), *unknown*.
- **Verdict per 15-minute window**, with small thresholds because the user
  base is small: a definite setup fault alerts on first sight; otherwise two
  users on our side, three on Google's, or five phones refused by App Check.
  When Google is to blame the check reads the Google Cloud and Firebase status
  feeds and names any open incident on Gemini, Vertex AI or AI Logic. When
  both sides fail, the verdict says *ours*, since that's the one we can act on.
- **One alert path:** the schedule logs `AI fill alert` at error level, and a
  Cloud Monitoring log-match policy emails the owner (runbook), at most once
  an hour. No mail service in our code.
- **Kept 90 days** through Firestore TTL on `expireAt`.
- **The reporting callable does not enforce App Check**, since App Check
  failing is one of the things it reports. It requires a Firebase identity
  (Guests included), caps itself at three instances, and the phone sends at
  most ten reports per page load. A forged report can only add noise to a
  server-only collection.
- **No automatic compensation.** The window summary lists paying users who
  were hit so the owner can decide on a goodwill month; nothing is granted
  without the owner's say (runbook § Goodwill month).

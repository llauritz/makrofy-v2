# PROTOTYPE — Gemini grounding + responseSchema spike (issue #20)

**Throwaway code. Never ship this. Lives on branch `spike/20-gemini-grounding`, out of main.**

## The question

Does the pinned Firebase AI Logic Web SDK (`firebase@12.16.0`, `firebase/ai`) forward
`responseSchema` **and** `tools: [{ googleSearch: {} }]` **together** on
**`gemini-3.1-flash-lite`** specifically — and what are real grounded vs ungrounded
latencies? The combined capability is a documented Gemini-3-series preview, but the docs'
worked example used `gemini-3.1-pro-preview`, not our model
(`docs/research/gemini-firebase-ai-logic-macro-fill.md` Q1/Q5).

## Run it

```
cd spikes/gemini-grounding
npm install
npm run spike                       # full probe suite (staple + branded, grounded + ungrounded)
node spike.mjs "10g butter"         # ad-hoc: one grounded probe for any food text
node spike.mjs --two-step "input"   # force the documented two-step fallback shape
```

Runs against the live `goyaffle` project. The config in `spike.mjs` is the public
web-app config. **App Check is auto-enforced for AI Logic** (finding of this spike —
#12 recorded enforcement OFF, but the early-July-2026 AI Logic auto-enforcement applies),
so a debug token is required: `APPCHECK_DEBUG_TOKEN=<value> npm run spike`. The spike
exchanges it for an App Check JWT itself (Node has no reCAPTCHA); the value is never
printed or committed.

This spike is normally interactive-by-argument rather than a keystroke TUI: the state
being inspected is one response per probe (schema conformance, groundingMetadata,
latency), so a scripted suite + free-text argument covers it.

## What is throwaway vs liftable

- `spike.mjs` — throwaway shell: probe suite, fetch tap (logs what the SDK actually
  puts in the request body), console reporting.
- `macro-fill.mjs` — the liftable part: the four-tier `responseSchema` built with the
  SDK `Schema` helpers, the tier-rules system prompt, and the call wrappers
  (`fillMacrosCombined`, `fillMacrosTwoStep`). The AI macro-fill ticket ports this to
  TypeScript in `src/`.

## Verdict

Recorded as a comment on issue #20 once the suite has run.

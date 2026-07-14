---
name: verify
description: Launch and drive Yaffle to verify a change end-to-end in the running app.
---

# Verifying Yaffle changes

## Launch

- `pnpm dev` (background) — starts Auth+Firestore emulators (needs JDK 21; `scripts/emulators.mjs` handles JAVA_HOME) plus Vite. Wait for the "Local: http://localhost:PORT" line; the port is **5173 or the next free one** — read it from the output, don't assume.
- Fresh emulator = empty day, anonymous identity auto-minted. No login needed.

## Drive

- Browser: chrome-devtools MCP tools, or the `chrome-devtools` CLI when the MCP profile is locked by another session (common with parallel sessions). Viewport 390x844 (`resize_page`); `?theme=dark|light` forces the mode.
- Add an Entry: fill `input[aria-label="Food"]` (+ Calories/macros), click `button[aria-label="Add entry"]`. React inputs need the native value setter + `input` event when filling via `evaluate_script`.
- Edit flow: click a row (`button[aria-label^="Edit"]`) → inline editor (Save/Cancel/Delete buttons by aria-label). Escape cancels. Delete shows the undo snackbar (6 s).

## Animation evidence

Screenshots can't show motion. Sample per frame via `evaluate_script`: click, then a `requestAnimationFrame` loop recording `getBoundingClientRect().height`, `getComputedStyle(el).transform` (must stay `none`/uniform — spec § Motion bans stretch), inline `style`, opacity, and the next sibling's `top` (lockstep push). ~700 ms window catches the full fade-through.

## Gotchas

- Port 5173 usually taken by the primary checkout's dev server.
- `firestore-debug.log` appears in the cwd — gitignored, ignore it.

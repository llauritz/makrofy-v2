// Renders the Yaffle PWA icon set — a Fraunces "Y" (the brand initial), ink
// #2b2015 on flour #f6f1e6 (spec § PWA & offline) — into public/icons/.
//
// Browser-free: @napi-rs/canvas (a prebuilt Skia binding, no system deps)
// registers the Fraunces variable woff2 and rasterises each icon. The PNGs are
// committed; regenerate only if the mark changes:
//
//   pnpm add -D @napi-rs/canvas && node scripts/generate-pwa-icons.mjs
//
// @napi-rs/canvas is not a kept dependency — install it for a regen, then remove.

import { createCanvas, GlobalFonts } from "@napi-rs/canvas"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const INK = "#2b2015"
const FLOUR = "#f6f1e6"
// The brand initial. Yaffle → "Y" (the spec/issue predate the Makrofy→Yaffle
// rename and still say "M"; the mark follows the name).
const LETTER = "Y"

// capFrac = the letter's cap height as a fraction of the canvas. Maskable and
// monochrome shrink the mark into the ~80%-diameter safe zone; opaque icons
// (and Apple, which rounds its own corners) run larger.
const SPECS = [
  { name: "icon-192", size: 192, bg: FLOUR, fg: INK, capFrac: 0.6 },
  { name: "icon-512", size: 512, bg: FLOUR, fg: INK, capFrac: 0.6 },
  { name: "maskable-512", size: 512, bg: FLOUR, fg: INK, capFrac: 0.46 },
  { name: "monochrome-512", size: 512, bg: null, fg: INK, capFrac: 0.46 },
  { name: "apple-touch-icon", size: 180, bg: FLOUR, fg: INK, capFrac: 0.6 },
  { name: "favicon-32", size: 32, bg: FLOUR, fg: INK, capFrac: 0.68 },
]

GlobalFonts.register(
  readFileSync(
    resolve(
      root,
      "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-standard-normal.woff2",
    ),
  ),
  "FrauncesGen",
)

function render(spec) {
  const canvas = createCanvas(spec.size, spec.size)
  const ctx = canvas.getContext("2d")
  if (spec.bg) {
    ctx.fillStyle = spec.bg
    ctx.fillRect(0, 0, spec.size, spec.size)
  }
  ctx.fillStyle = spec.fg
  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"

  // Scale the font so the letter's cap height hits capFrac of the canvas.
  // (napi's font parser rejects numeric weights, so "bold" carries the wght axis.)
  let px = spec.size
  ctx.font = `bold ${px}px FrauncesGen`
  let cap = ctx.measureText(LETTER).actualBoundingBoxAscent
  px = (px * (spec.size * spec.capFrac)) / cap
  ctx.font = `bold ${px}px FrauncesGen`
  const m = ctx.measureText(LETTER)

  // Centre the ink box: descent is ~0 for a cap letter, so nudge down by half ascent.
  ctx.fillText(LETTER, spec.size / 2, spec.size / 2 + m.actualBoundingBoxAscent / 2)
  return canvas.toBuffer("image/png")
}

const dir = resolve(root, "public/icons")
mkdirSync(dir, { recursive: true })
for (const spec of SPECS) {
  const png = render(spec)
  writeFileSync(resolve(dir, `${spec.name}.png`), png)
  console.log(`${spec.name}.png  ${spec.size}×${spec.size}  ${png.length} bytes`)
}

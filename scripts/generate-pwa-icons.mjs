// Renders the Yaffle PWA icon set — the italic brand "Y" from the animated
// wordmark (src/assets/yaffle-wordmark.json, layer "Asset 8.svg"), ink
// #2b2015 on flour #f6f1e6 (spec § PWA & offline) — into public/icons/.
//
// Browser-free: @napi-rs/canvas (a prebuilt Skia binding, no system deps)
// fills the glyph path directly and rasterises each icon. The PNGs (and
// favicon.svg) are committed; regenerate only if the mark changes:
//
//   pnpm add -D @napi-rs/canvas && node scripts/generate-pwa-icons.mjs
//
// @napi-rs/canvas is not a kept dependency — install it for a regen, then remove.

import { createCanvas, Path2D } from "@napi-rs/canvas"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const INK = "#2b2015"
const FLOUR = "#f6f1e6"
// The monochrome mark must be WHITE on the transparent (black) field, NOT ink.
// Android themes this icon by recolouring it — it keeps the shape and discards
// our colour — so the source needs luminance contrast: a bright mark on a dark
// field. A dark mark on transparent black is near-uniformly dark, which some
// launcher pipelines read inverted, rendering it as a tinted square with the
// letter stamped out. White is the platform convention every other app follows.
const MONO = "#ffffff"

// The italic Y letterform, verbatim from the wordmark's first letter
// (branding "Asset 8.svg" = layer "Asset 8.svg 3" in the Lottie). The box is
// the asset's viewBox; the glyph fills it edge to edge, swash tail included.
const Y_D =
  "M9.66,18.11l6.48-12.67c.74-1.38,1.44-2.46,2.12-3.25.67-.79,1.37-1.35,2.08-1.69s1.46-.5,2.25-.5c1.04,0,1.83.27,2.37.82.54.55.8,1.23.8,2.05,0,.99-.34,1.82-1.03,2.49-.69.67-1.7,1.18-3.02,1.55-.75.19-1.41.42-1.99.68s-1.1.64-1.59,1.11c-.48.48-.94,1.14-1.38,2l-3.98,7.51c-.27.51-.46.95-.58,1.33-.12.38-.22.73-.3,1.06l-.94,3.91c-.12.38-.13.67-.04.88.09.21.28.38.56.48l.84.3c.37.16.62.35.74.56.12.21.18.44.18.66,0,.48-.16.86-.49,1.13-.33.27-.77.41-1.33.41H1.71c-.59,0-.99-.12-1.21-.36s-.33-.56-.33-.96c0-.7.39-1.21,1.18-1.55l.88-.26c.35-.12.61-.29.79-.51s.33-.57.45-1.03l1.14-4.14c.13-.44.17-.91.1-1.4-.07-.49-.14-.97-.22-1.44-.07-.29-.15-.76-.24-1.38-.09-.63-.2-1.36-.32-2.18-.12-.82-.25-1.67-.38-2.55-.13-.88-.26-1.72-.39-2.54-.13-.82-.25-1.54-.37-2.16-.12-.62-.21-1.08-.28-1.38-.09-.43-.25-.75-.48-.96-.23-.21-.56-.38-.98-.5-.33-.11-.59-.27-.77-.48S0,2.69,0,2.37c-.01-.44.14-.81.46-1.09.32-.29.76-.43,1.33-.43h4.92c.8,0,1.41.15,1.82.46.41.31.67.8.77,1.49.07.39.17.97.3,1.76.13.78.28,1.68.43,2.7s.32,2.08.5,3.18.35,2.17.52,3.19c.17,1.02.32,1.94.46,2.74.14.8.26,1.41.35,1.81l-2.21-.06Z"
const Y_BOX = { w: 25.76, h: 28.95 }

// glyphFrac = the glyph box's height as a fraction of the canvas. Maskable and
// monochrome shrink the mark into the ~80%-diameter safe zone; opaque icons
// (and Apple, which rounds its own corners) run larger.
const SPECS = [
  { name: "icon-192", size: 192, bg: FLOUR, fg: INK, glyphFrac: 0.64 },
  { name: "icon-512", size: 512, bg: FLOUR, fg: INK, glyphFrac: 0.64 },
  { name: "maskable-512", size: 512, bg: FLOUR, fg: INK, glyphFrac: 0.5 },
  { name: "monochrome-512", size: 512, bg: null, fg: MONO, glyphFrac: 0.5 },
  { name: "apple-touch-icon", size: 180, bg: FLOUR, fg: INK, glyphFrac: 0.64 },
  { name: "favicon-32", size: 32, bg: FLOUR, fg: INK, glyphFrac: 0.72 },
]

function glyphTransform(size, glyphFrac) {
  const s = (size * glyphFrac) / Y_BOX.h
  return {
    s,
    x: (size - Y_BOX.w * s) / 2,
    y: (size - Y_BOX.h * s) / 2,
  }
}

function render(spec) {
  const canvas = createCanvas(spec.size, spec.size)
  const ctx = canvas.getContext("2d")
  if (spec.bg) {
    ctx.fillStyle = spec.bg
    ctx.fillRect(0, 0, spec.size, spec.size)
  }
  ctx.fillStyle = spec.fg
  const { s, x, y } = glyphTransform(spec.size, spec.glyphFrac)
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fill(new Path2D(Y_D))
  return canvas.toBuffer("image/png")
}

// A vector favicon for browsers that take one (crisp at any tab size); the
// 32px PNG stays as the fallback.
function faviconSvg() {
  const size = 32
  const { s, x, y } = glyphTransform(size, 0.72)
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`,
    `  <rect width="${size}" height="${size}" fill="${FLOUR}"/>`,
    `  <path transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${s.toFixed(4)})" fill="${INK}" d="${Y_D}"/>`,
    `</svg>`,
    ``,
  ].join("\n")
}

const dir = resolve(root, "public/icons")
mkdirSync(dir, { recursive: true })
for (const spec of SPECS) {
  const png = render(spec)
  writeFileSync(resolve(dir, `${spec.name}.png`), png)
  console.log(`${spec.name}.png  ${spec.size}×${spec.size}  ${png.length} bytes`)
}
writeFileSync(resolve(dir, "favicon.svg"), faviconSvg())
console.log("favicon.svg")

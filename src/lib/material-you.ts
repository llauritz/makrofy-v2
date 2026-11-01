// Wallpaper colours ("Material You") for the Android app: the system's dynamic
// tonal palettes, mapped onto Yaffle's colour tokens.
//
// Every token keeps the lightness (CIELAB L*, which is Material's "tone") it has
// in the Warm Market palette (src/index.css) and only takes its hue and chroma
// from the wallpaper. So contrast, the card-on-background step and every other
// light/dark relationship stay exactly as designed; the app just turns the
// user's colour instead of flour-and-ink. The one deliberate exception is
// `primary` (the filled CTA buttons), which becomes Material's own accent role
// so the wallpaper colour shows somewhere other than a tint.
//
// The macro colours (P/F/C) and destructive red carry meaning and are never
// remapped.

/** Android's system_accent1/neutral1/neutral2 ramps, tones 100 → 0 (13 stops each). */
export type MaterialYouPalette = {
  accent1: string[]
  neutral1: string[]
  neutral2: string[]
}

type PaletteName = keyof MaterialYouPalette
type Mode = "light" | "dark"

// --- CIELAB (D65) --------------------------------------------------------

type Lab = { l: number; a: number; b: number }

const WHITE = { x: 0.95047, y: 1, z: 1.08883 }

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
}

function labF(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116
}

function labFInv(t: number): number {
  return t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27)
}

export function hexToLab(hex: string): Lab {
  const n = parseInt(hex.slice(1), 16)
  const r = srgbToLinear(((n >> 16) & 255) / 255)
  const g = srgbToLinear(((n >> 8) & 255) / 255)
  const b = srgbToLinear((n & 255) / 255)
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / WHITE.x
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / WHITE.y
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / WHITE.z
  const fx = labF(x)
  const fy = labF(y)
  const fz = labF(z)
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function labToHex({ l, a, b }: Lab): string {
  const fy = (l + 16) / 116
  const x = labFInv(fy + a / 500) * WHITE.x
  const y = labFInv(fy) * WHITE.y
  const z = labFInv(fy - b / 200) * WHITE.z
  const rgb = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ]
  return (
    "#" +
    rgb
      .map((c) => {
        const v = Math.round(linearToSrgb(Math.min(1, Math.max(0, c))) * 255)
        return v.toString(16).padStart(2, "0")
      })
      .join("")
  )
}

/**
 * The palette's colour at a given tone (L*). Android only ships 13 stops per
 * ramp, so tones in between are interpolated in Lab between the two nearest
 * stops (by their measured lightness), which is how the ramps are built.
 */
export function colorAtTone(ramp: readonly string[], tone: number): string {
  const stops = ramp.map(hexToLab).sort((p, q) => p.l - q.l)
  if (stops.length === 0) throw new Error("empty palette")
  let lo = stops[0]
  let hi = stops[stops.length - 1]
  if (tone <= lo.l) hi = lo
  else if (tone >= hi.l) lo = hi
  else {
    for (let i = 1; i < stops.length; i++) {
      if (stops[i].l >= tone) {
        lo = stops[i - 1]
        hi = stops[i]
        break
      }
    }
  }
  const t = hi.l === lo.l ? 0 : (tone - lo.l) / (hi.l - lo.l)
  return labToHex({
    l: tone,
    a: lo.a + (hi.a - lo.a) * t,
    b: lo.b + (hi.b - lo.b) * t,
  })
}

// --- Token mapping -------------------------------------------------------

type TokenSpec = {
  palette: PaletteName
  /** The Warm Market value, whose lightness the wallpaper colour keeps. */
  light: string
  dark: string
  /** Fixed Material tones instead of the Warm Market lightness. */
  tone?: Record<Mode, number>
}

// The Warm Market values must match src/index.css (a test checks they do).
// Neutral1 is Material's near-grey surface ramp, neutral2 its slightly more
// colourful "variant" ramp for inputs, borders and secondary text.
export const MATERIAL_YOU_TOKENS: Record<string, TokenSpec> = {
  background: { palette: "neutral1", light: "#f6f1e6", dark: "#17110c" },
  foreground: { palette: "neutral1", light: "#2b2015", dark: "#f3ece2" },
  card: { palette: "neutral1", light: "#fffdf7", dark: "#2a211a" },
  "card-foreground": { palette: "neutral1", light: "#2b2015", dark: "#f3ece2" },
  popover: { palette: "neutral1", light: "#fffdf7", dark: "#2a211a" },
  "popover-foreground": {
    palette: "neutral1",
    light: "#2b2015",
    dark: "#f3ece2",
  },
  primary: {
    palette: "accent1",
    light: "#2b2015",
    dark: "#f3ece2",
    tone: { light: 40, dark: 80 },
  },
  "primary-foreground": {
    palette: "accent1",
    light: "#f6f1e6",
    dark: "#17110c",
    tone: { light: 100, dark: 20 },
  },
  secondary: { palette: "neutral2", light: "#f3ecdd", dark: "#211a12" },
  "secondary-foreground": {
    palette: "neutral1",
    light: "#2b2015",
    dark: "#f3ece2",
  },
  muted: { palette: "neutral2", light: "#f3ecdd", dark: "#211a12" },
  "muted-foreground": {
    palette: "neutral2",
    light: "#7d7060",
    dark: "#a5988a",
  },
  accent: { palette: "neutral2", light: "#f3ecdd", dark: "#211a12" },
  "accent-foreground": {
    palette: "neutral1",
    light: "#2b2015",
    dark: "#f3ece2",
  },
  border: { palette: "neutral2", light: "#eee5d2", dark: "#3a2f22" },
  input: { palette: "neutral2", light: "#f3ecdd", dark: "#211a12" },
  ring: { palette: "neutral2", light: "#7d7060", dark: "#a5988a" },
  // The Warm Market extras that used to be hex literals in components.
  placeholder: { palette: "neutral2", light: "#a5988a", dark: "#a5988a" },
  hairline: { palette: "neutral2", light: "#efe6d4", dark: "#3a2f22" },
  dash: { palette: "neutral2", light: "#cbbfa4", dark: "#4a3e2e" },
  tan: { palette: "neutral2", light: "#cbbfa4", dark: "#5a4c3b" },
  dot: { palette: "neutral2", light: "#b9ab92", dark: "#5a4c3b" },
  "chip-border": { palette: "neutral2", light: "#e6dcc8", dark: "#3a2f22" },
  "ai-outline": { palette: "accent1", light: "#8f7c5e", dark: "#8a775c" },
}

/**
 * The CSS custom properties (name without `--` → colour) that repaint the app
 * in the wallpaper's colours for the given light/dark mode.
 */
export function materialYouTokens(
  palette: MaterialYouPalette,
  mode: Mode
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, spec] of Object.entries(MATERIAL_YOU_TOKENS)) {
    const tone = spec.tone?.[mode] ?? hexToLab(spec[mode]).l
    out[name] = colorAtTone(palette[spec.palette], tone)
  }
  return out
}

const HEX = /^#[0-9a-f]{6}$/i

/** True when `value` is a well-formed palette (as the Android shell sends it). */
export function isMaterialYouPalette(
  value: unknown
): value is MaterialYouPalette {
  if (typeof value !== "object" || value === null) return false
  const p = value as Record<string, unknown>
  return (["accent1", "neutral1", "neutral2"] as const).every(
    (key) =>
      Array.isArray(p[key]) &&
      (p[key] as unknown[]).length > 1 &&
      (p[key] as unknown[]).every((c) => typeof c === "string" && HEX.test(c))
  )
}

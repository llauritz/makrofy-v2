// A synthetic blue wallpaper palette in Android's shape, shared by the
// wallpaper-colour tests.
import { labToHex, type MaterialYouPalette } from "@/lib/material-you"

// Android ramp stops, tone 100 → 0.
const TONES = [100, 99, 95, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0]

function ramp(hueDeg: number, chroma: number): string[] {
  const h = (hueDeg * Math.PI) / 180
  return TONES.map((l) =>
    labToHex({ l, a: chroma * Math.cos(h), b: chroma * Math.sin(h) })
  )
}

// A blue wallpaper, roughly what Android derives from one.
export const BLUE: MaterialYouPalette = {
  accent1: ramp(280, 40),
  neutral1: ramp(280, 4),
  neutral2: ramp(280, 8),
}

import { registerPlugin } from "@capacitor/core"

import {
  isMaterialYouPalette,
  type MaterialYouPalette,
} from "@/lib/material-you"

import { isNativeApp } from "./platform"

// MaterialYouPlugin in android/app/src/main/java/com/goyaffle/app/MaterialYou.kt.
interface MaterialYouPlugin {
  getPalette(): Promise<{ palette?: unknown }>
}

const MaterialYou = registerPlugin<MaterialYouPlugin>("MaterialYou")

declare global {
  interface Window {
    /** Set by the Android shell before any page script runs (Android 12+). */
    __yaffleMaterialYou?: unknown
  }
}

/**
 * The wallpaper's tonal palette, synchronously. On Android 12+ the shell
 * injects it before the page's first script, so the very first frame can
 * already be in the wallpaper's colours. Null on the web, on older Android, or
 * when the WebView can't inject early (then see {@link fetchMaterialYouPalette}).
 */
export function readMaterialYouPalette(): MaterialYouPalette | null {
  const value =
    typeof window === "undefined" ? undefined : window.__yaffleMaterialYou
  return isMaterialYouPalette(value) ? value : null
}

/**
 * Ask the shell for the palette over the bridge — the fallback for a WebView
 * too old to take the early script. Resolves null on the web and below
 * Android 12, which has no wallpaper colours.
 */
export async function fetchMaterialYouPalette(): Promise<MaterialYouPalette | null> {
  if (!isNativeApp()) return null
  try {
    const { palette } = await MaterialYou.getPalette()
    return isMaterialYouPalette(palette) ? palette : null
  } catch {
    return null
  }
}

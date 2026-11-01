/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

import {
  MATERIAL_YOU_TOKENS,
  materialYouTokens,
  type MaterialYouPalette,
} from "@/lib/material-you"
import { setSystemBarsTheme } from "@/native/chrome"
import {
  fetchMaterialYouPalette,
  readMaterialYouPalette,
} from "@/native/material-you"

type Theme = "dark" | "light" | "system"
type ResolvedTheme = "dark" | "light"
/** Yaffle's own Warm Market palette, or the wallpaper's (Android 12+ only). */
export type ColorSource = "yaffle" | "wallpaper"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
  disableTransitionOnChange?: boolean
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  colorSource: ColorSource
  setColorSource: (source: ColorSource) => void
  /** True only in the Android app on Android 12+, which has wallpaper colours. */
  wallpaperColorsAvailable: boolean
}

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"
const THEME_VALUES: Theme[] = ["dark", "light", "system"]
const COLOR_SOURCE_KEY = "color-source"

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined)

function isTheme(value: string | null): value is Theme {
  if (value === null) {
    return false
  }

  return THEME_VALUES.includes(value as Theme)
}

function getSystemTheme(): ResolvedTheme {
  if (window.matchMedia(COLOR_SCHEME_QUERY).matches) {
    return "dark"
  }

  return "light"
}

// Keep the browser/OS chrome colour matched to the resolved theme (spec § PWA).
// A single meta (updated here) beats static per-mode metas, which only track
// the OS and would mis-report during a manual light/dark override.
const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#f6f1e6",
  dark: "#17110c",
}

function applyThemeColorMeta(resolvedTheme: ResolvedTheme, color: string) {
  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  )
  if (!meta) {
    meta = document.createElement("meta")
    meta.name = "theme-color"
    document.head.appendChild(meta)
  }
  meta.content = color
  // The Android app has no browser chrome to read the meta: its status and
  // navigation bars are painted from the same colour (no-op on the web).
  setSystemBarsTheme(color, resolvedTheme === "dark")
}

// Wallpaper colours are inline custom properties on <html>, which beat both
// the :root and .dark blocks in index.css; clearing them falls straight back
// to Warm Market. Returns the background colour actually in use.
function applyColorTokens(
  resolvedTheme: ResolvedTheme,
  palette: MaterialYouPalette | null
): string {
  const style = document.documentElement.style
  if (!palette) {
    for (const name of Object.keys(MATERIAL_YOU_TOKENS)) {
      style.removeProperty(`--${name}`)
    }
    return THEME_COLORS[resolvedTheme]
  }
  const tokens = materialYouTokens(palette, resolvedTheme)
  for (const [name, value] of Object.entries(tokens)) {
    style.setProperty(`--${name}`, value)
  }
  return tokens.background
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}"
    )
  )
  document.head.appendChild(style)

  return () => {
    window.getComputedStyle(document.body)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove()
      })
    })
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  const editableParent = target.closest(
    "input, textarea, select, [contenteditable='true']"
  )
  if (editableParent) {
    return true
  }

  return false
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    const storedTheme = localStorage.getItem(storageKey)
    if (isTheme(storedTheme)) {
      return storedTheme
    }

    return defaultTheme
  })

  // Present before the first render in the Android app (the shell injects it
  // ahead of any script), so launch is already in the wallpaper's colours.
  const [palette, setPalette] = React.useState(readMaterialYouPalette)
  const [colorSource, setColorSourceState] = React.useState<ColorSource>(
    () =>
      localStorage.getItem(COLOR_SOURCE_KEY) === "yaffle"
        ? "yaffle"
        : "wallpaper"
  )

  React.useEffect(() => {
    if (palette) return undefined
    let cancelled = false
    void fetchMaterialYouPalette().then((fetched) => {
      if (!cancelled && fetched) setPalette(fetched)
    })
    return () => {
      cancelled = true
    }
  }, [palette])

  const setColorSource = React.useCallback((next: ColorSource) => {
    localStorage.setItem(COLOR_SOURCE_KEY, next)
    setColorSourceState(next)
  }, [])

  const activePalette = colorSource === "wallpaper" ? palette : null

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      localStorage.setItem(storageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [storageKey]
  )

  const applyTheme = React.useCallback(
    (nextTheme: Theme) => {
      const root = document.documentElement
      const resolvedTheme =
        nextTheme === "system" ? getSystemTheme() : nextTheme
      const restoreTransitions = disableTransitionOnChange
        ? disableTransitionsTemporarily()
        : null

      root.classList.remove("light", "dark")
      root.classList.add(resolvedTheme)
      const background = applyColorTokens(resolvedTheme, activePalette)
      applyThemeColorMeta(resolvedTheme, background)

      if (restoreTransitions) {
        restoreTransitions()
      }
    },
    [disableTransitionOnChange, activePalette]
  )

  React.useEffect(() => {
    applyTheme(theme)

    if (theme !== "system") {
      return undefined
    }

    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
    const handleChange = () => {
      applyTheme("system")
    }

    mediaQuery.addEventListener("change", handleChange)

    return () => {
      mediaQuery.removeEventListener("change", handleChange)
    }
  }, [theme, applyTheme])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (isEditableTarget(event.target)) {
        return
      }

      if (event.key.toLowerCase() !== "d") {
        return
      }

      setThemeState((currentTheme) => {
        const nextTheme =
          currentTheme === "dark"
            ? "light"
            : currentTheme === "light"
              ? "dark"
              : getSystemTheme() === "dark"
                ? "light"
                : "dark"

        localStorage.setItem(storageKey, nextTheme)
        return nextTheme
      })
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [storageKey])

  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) {
        return
      }

      if (event.key !== storageKey) {
        return
      }

      if (isTheme(event.newValue)) {
        setThemeState(event.newValue)
        return
      }

      setThemeState(defaultTheme)
    }

    window.addEventListener("storage", handleStorageChange)

    return () => {
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [defaultTheme, storageKey])

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
      colorSource,
      setColorSource,
      wallpaperColorsAvailable: palette !== null,
    }),
    [theme, setTheme, colorSource, setColorSource, palette]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}

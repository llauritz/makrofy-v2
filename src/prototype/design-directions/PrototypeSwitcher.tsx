// PROTOTYPE — floating variant switcher for issue #4. Not part of any design being judged.
// Top-center (not the usual bottom-center) because every variant's signature element
// is its bottom summary bar — the switcher must not cover it.
import * as React from "react"
import { ChevronLeft, ChevronRight, Moon, Sun } from "lucide-react"

import { useTheme } from "@/components/theme-provider"

export type VariantDef = { key: string; name: string }

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']")
  )
}

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: VariantDef[]
  current: string
  onChange: (key: string) => void
}) {
  const { theme, setTheme } = useTheme()

  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  )

  const cycle = React.useCallback(
    (dir: 1 | -1) => {
      const next = (index + dir + variants.length) % variants.length
      onChange(variants[next].key)
    },
    [index, variants, onChange]
  )

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (event.key === "ArrowLeft") cycle(-1)
      if (event.key === "ArrowRight") cycle(1)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [cycle])

  if (import.meta.env.PROD) return null

  const resolvedDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)

  return (
    <div className="fixed top-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-zinc-900/90 px-1.5 py-1 text-xs font-medium text-white shadow-lg backdrop-blur dark:bg-white/90 dark:text-zinc-900">
      <button
        aria-label="Previous variant"
        onClick={() => cycle(-1)}
        className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/15 dark:hover:bg-zinc-900/10"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-28 text-center whitespace-nowrap select-none">
        {variants[index].key} — {variants[index].name}
      </span>
      <button
        aria-label="Next variant"
        onClick={() => cycle(1)}
        className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/15 dark:hover:bg-zinc-900/10"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <span className="mx-0.5 h-4 w-px bg-white/25 dark:bg-zinc-900/20" />
      <button
        aria-label="Toggle dark mode"
        onClick={() => setTheme(resolvedDark ? "light" : "dark")}
        className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/15 dark:hover:bg-zinc-900/10"
      >
        {resolvedDark ? (
          <Sun className="h-3.5 w-3.5" />
        ) : (
          <Moon className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  )
}

// PROTOTYPE — issue #5 "Prototype the add flow: history typeahead + tiered AI fill".
// Plan: three interaction-contract variants of the add card, switchable via
// ?variant= (A|B|C), mounted on the home route. The visual shell is the locked
// "Warm Market" direction from issue #4 and is NOT under evaluation — the
// variants differ in WHERE an AI answer lands and what commits it:
//   A "Inline fill"  — AI fills the form; the Add button commits.
//   B "Review sheet" — AI proposes an entry in a bottom sheet; the sheet commits.
//   C "Direct add"   — AI commits straight into the list; Undo repairs.
// Throwaway: delete this directory and the App.tsx mount once the contract is
// settled. ?theme=light|dark forces the mode (screenshot workflow).
import * as React from "react"
import "@fontsource-variable/fraunces"

import { useTheme } from "@/components/theme-provider"

import {
  PrototypeSwitcher,
  type VariantDef,
} from "../design-directions/PrototypeSwitcher"
import { SEED_ENTRIES, type Entry } from "./Shell"
import { TRY_PHRASES } from "./engine"
import { VariantDirect } from "./VariantDirect"
import { VariantInline } from "./VariantInline"
import { VariantSheet } from "./VariantSheet"

export type VariantProps = {
  entries: Entry[]
  addEntry: (e: Entry) => void
  removeEntry: (id: string) => void
  seed: { text: string; nonce: number } | null
}

const VARIANTS: VariantDef[] = [
  { key: "A", name: "Inline fill" },
  { key: "B", name: "Review sheet" },
  { key: "C", name: "Direct add" },
]

function useVariantParam(): [string, (key: string) => void] {
  const [variant, setVariant] = React.useState(() => {
    const v = new URLSearchParams(window.location.search)
      .get("variant")
      ?.toUpperCase()
    return VARIANTS.some((d) => d.key === v) ? (v as string) : "A"
  })
  const set = React.useCallback((key: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set("variant", key)
    window.history.replaceState(null, "", url)
    setVariant(key)
  }, [])
  return [variant, set]
}

// Prototype furniture (not part of the design): one tap-to-type phrase per
// AI tier, so every tier is reachable without remembering the mock's rules.
function TryTray({ onPick }: { onPick: (text: string) => void }) {
  if (import.meta.env.PROD) return null
  return (
    <div className="fixed top-11 left-1/2 z-50 flex max-w-[95vw] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full bg-zinc-900/90 px-2 py-1 text-[10px] text-white shadow-lg backdrop-blur dark:bg-white/90 dark:text-zinc-900">
      <span className="shrink-0 px-0.5 opacity-60 select-none">try:</span>
      {TRY_PHRASES.map((phrase) => (
        <button
          key={phrase}
          onClick={() => onPick(phrase)}
          className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 whitespace-nowrap hover:bg-white/25 dark:bg-zinc-900/10 dark:hover:bg-zinc-900/20"
        >
          {phrase}
        </button>
      ))}
    </div>
  )
}

export function AddFlowPrototype() {
  const [variant, setVariant] = useVariantParam()
  const { setTheme } = useTheme()
  // Entries are shared across variants so an add in A is still there in B/C.
  const [entries, setEntries] = React.useState<Entry[]>(SEED_ENTRIES)
  const [seed, setSeed] = React.useState<{ text: string; nonce: number } | null>(
    null
  )

  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("theme")
    if (t === "dark" || t === "light") setTheme(t)
  }, [setTheme])

  const addEntry = React.useCallback((e: Entry) => {
    setEntries((prev) => [...prev, e])
    // New entries append at the bottom of the day log, which sits under the
    // sticky summary — bring the result into view so the add is visible.
    requestAnimationFrame(() =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })
    )
  }, [])
  const removeEntry = React.useCallback(
    (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id)),
    []
  )

  const props: VariantProps = { entries, addEntry, removeEntry, seed }

  return (
    <>
      {variant === "A" && <VariantInline {...props} />}
      {variant === "B" && <VariantSheet {...props} />}
      {variant === "C" && <VariantDirect {...props} />}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={setVariant}
      />
      <TryTray onPick={(text) => setSeed((s) => ({ text, nonce: (s?.nonce ?? 0) + 1 }))} />
    </>
  )
}

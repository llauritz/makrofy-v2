// PROTOTYPE — issue #4 "Choose the V2 visual design direction".
// Plan: three visual-direction variants of the main screen, switchable via
// ?variant= (A|B|C), mounted on the home route (App.tsx is still the placeholder page).
// Throwaway: delete this directory and the App.tsx mount once a direction is chosen.
import * as React from "react"
import "@fontsource-variable/fraunces"
import "@fontsource-variable/outfit"

import { useTheme } from "@/components/theme-provider"

import { PrototypeSwitcher, type VariantDef } from "./PrototypeSwitcher"
import { VariantA } from "./VariantA"
import { VariantB } from "./VariantB"
import { VariantC } from "./VariantC"

const VARIANTS: VariantDef[] = [
  { key: "A", name: "Instrument" },
  { key: "B", name: "Market plate" },
  { key: "C", name: "Timeline" },
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

export function DesignDirectionsPrototype() {
  const [variant, setVariant] = useVariantParam()
  const { setTheme } = useTheme()

  // Dev convenience: ?theme=dark|light forces the mode (shareable per-mode links,
  // and lets headless screenshots capture both modes).
  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("theme")
    if (t === "dark" || t === "light") setTheme(t)
  }, [setTheme])
  return (
    <>
      {variant === "A" && <VariantA />}
      {variant === "B" && <VariantB />}
      {variant === "C" && <VariantC />}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={setVariant}
      />
    </>
  )
}

// PROTOTYPE — issue #7 "Decide which statistics earn a place".
// Plan: three placement+set philosophies for V2 stats, switchable via ?variant=
// (A|B|C), hosted on the locked "Warm Market" main screen (not under evaluation):
//   A "Dashboard"    — separate stats screen, FULL candidate set
//   B "Glance strip" — inline strip on the main screen only, NO stats screen
//   C "Week report"  — inline teaser + a curated, narrative stats screen
// Throwaway: delete this directory and the App.tsx mount once the stat set and
// placement are settled. ?theme=light|dark forces the mode (screenshot workflow).
import * as React from "react"
import "@fontsource-variable/fraunces"

import { useTheme } from "@/components/theme-provider"

import {
  PrototypeSwitcher,
  type VariantDef,
} from "../design-directions/PrototypeSwitcher"
import { VariantDashboard } from "./VariantDashboard"
import { VariantReport } from "./VariantReport"
import { VariantStrip } from "./VariantStrip"

const VARIANTS: VariantDef[] = [
  { key: "A", name: "Dashboard" },
  { key: "B", name: "Glance strip" },
  { key: "C", name: "Week report" },
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

export function StatsPrototype() {
  const [variant, setVariant] = useVariantParam()
  const { setTheme } = useTheme()

  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("theme")
    if (t === "dark" || t === "light") setTheme(t)
  }, [setTheme])

  return (
    <>
      {variant === "A" && <VariantDashboard />}
      {variant === "B" && <VariantStrip />}
      {variant === "C" && <VariantReport />}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={setVariant}
      />
    </>
  )
}

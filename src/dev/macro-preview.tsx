/* eslint-disable react-refresh/only-export-components */
// TEMPORARY — macro color preview for the vibrancy PR; drop before merge.
// A small switcher pinned to the top of the screen swaps the P/F/C tokens
// between the shipped set (A) and the alternatives in macro-preview.css.
// ?macros=current|a|b|c picks one from a link; the choice sticks per device.
import { createRoot } from "react-dom/client"
import * as React from "react"

import { Squircle } from "@/components/ui/squircle"
import "../macro-preview.css"

const OPTIONS = [
  ["current", "Now"],
  ["a", "A"],
  ["b", "B"],
  ["c", "C"],
] as const
type Option = (typeof OPTIONS)[number][0]
const KEY = "macro-preview"

function read(): Option {
  const q = new URLSearchParams(window.location.search).get("macros")
  let v: string | null = q
  try {
    if (q) localStorage.setItem(KEY, q)
    else v = localStorage.getItem(KEY)
  } catch {
    /* storage blocked: the link param alone still works */
  }
  return OPTIONS.some(([k]) => k === v) ? (v as Option) : "a"
}

function apply(v: Option) {
  if (v === "a") document.documentElement.removeAttribute("data-macros")
  else document.documentElement.setAttribute("data-macros", v)
}

function Switcher() {
  const [v, setV] = React.useState<Option>(read)
  React.useEffect(() => {
    apply(v)
    try {
      localStorage.setItem(KEY, v)
    } catch {
      /* ignore */
    }
  }, [v])
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),6px)] z-[100] flex justify-center">
      <Squircle asChild pill>
        <div className="pointer-events-auto flex gap-0.5 rounded-full bg-foreground/85 p-0.5 text-[11px] font-semibold text-background shadow-lg backdrop-blur">
          {OPTIONS.map(([k, label]) => (
            <Squircle asChild pill key={k}>
              <button
                type="button"
                onClick={() => setV(k)}
                className={`rounded-full px-2.5 py-1 transition-colors ${v === k ? "bg-background text-foreground" : ""}`}
              >
                {label}
              </button>
            </Squircle>
          ))}
        </div>
      </Squircle>
    </div>
  )
}

export function mountMacroPreview() {
  const host = document.createElement("div")
  document.body.appendChild(host)
  createRoot(host).render(<Switcher />)
}

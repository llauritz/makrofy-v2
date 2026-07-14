import * as React from "react"
import { Plus } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import type { EntrySource } from "@/data/entries"
import { SPRING } from "./anim"
import {
  EMPTY_MACROS,
  macroInputsFrom,
  parseMacros,
  parseOptional,
  type EntryDraft,
} from "./fields"
import { MacroChips } from "./MacroChips"
import { MACROS, macroTint } from "./macros"
import {
  advanceSuggestions,
  EMPTY_INDEX,
  EMPTY_SUGGESTIONS,
  type Product,
  type ProductIndex,
} from "@/lib/suggestions"

// Label + kcal on top, tinted P/F/C gram pills + ink Add below, and — inside
// the same card, below the pills — the response zone that hosts history
// Suggestions (spec § Add flow, issue #18). Only Add commits: a Suggestion tap
// fills the form (source 'history') and never writes. #a5988a (not
// muted-foreground) for placeholders and the "g" unit in BOTH modes matches the
// record screenshots (issue #4).
export function AddCard({
  onAdd,
  index = EMPTY_INDEX,
  disabled = false,
}: {
  onAdd: (draft: EntryDraft, source: EntrySource) => void
  index?: ProductIndex
  disabled?: boolean
}) {
  const [label, setLabel] = React.useState("")
  const [kcal, setKcal] = React.useState("")
  const [macros, setMacros] = React.useState(EMPTY_MACROS)
  // Whether the current form contents came from a Suggestion tap. Typing in the
  // label makes it a manual Entry again; a tap sets it back to 'history'.
  const [source, setSource] = React.useState<EntrySource>("manual")
  const [suggestions, setSuggestions] = React.useState(EMPTY_SUGGESTIONS)
  const labelRef = React.useRef<HTMLInputElement>(null)

  // A blank-kcal Entry is intentional (0-kcal, dashed) — a label is the only
  // requirement to commit.
  const canAdd = label.trim() !== "" && !disabled

  const reset = () => {
    setLabel("")
    setKcal("")
    setMacros(EMPTY_MACROS)
    setSource("manual")
    setSuggestions(EMPTY_SUGGESTIONS)
  }

  const submit = () => {
    if (!canAdd) return
    onAdd(
      {
        label: label.trim(),
        kcal: parseOptional(kcal) ?? 0,
        ...parseMacros(macros),
      },
      source,
    )
    reset()
    labelRef.current?.focus()
  }

  // Every label edit re-runs the sticky word-by-word search and drops any
  // 'history' provenance — the user is describing their own food now.
  const onLabelChange = (value: string) => {
    setLabel(value)
    setSource("manual")
    setSuggestions((prev) => advanceSuggestions(prev, value, index))
  }

  // A tap fills the numbers and the label from the Product's freshest Entry,
  // marks the draft 'history', and collapses the zone — it commits nothing.
  const pick = (product: Product) => {
    setLabel(product.label)
    setKcal(String(product.kcal))
    setMacros(macroInputsFrom(product))
    setSource("history")
    setSuggestions(EMPTY_SUGGESTIONS)
    labelRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="mx-4 mt-1 rounded-3xl border bg-card p-3 shadow-[0_1px_2px_rgba(43,32,21,0.05)]">
      <div className="flex items-center gap-2">
        <input
          ref={labelRef}
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="What did you eat?"
          aria-label="Food"
          className="min-w-0 flex-1 rounded-full bg-input px-4 py-2.5 text-sm outline-none placeholder:text-[#a5988a]"
        />
        <input
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="kcal"
          inputMode="decimal"
          aria-label="Calories"
          className="w-16 rounded-full bg-input px-3 py-2.5 text-center text-sm tabular-nums outline-none placeholder:text-[#a5988a]"
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        {MACROS.map((m) => (
          <label
            key={m.key}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 py-2"
            style={{ backgroundColor: macroTint(m.mark, 11) }}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: m.mark }}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {m.letter}
            </span>
            <input
              value={macros[m.key]}
              onChange={(e) =>
                setMacros((prev) => ({ ...prev, [m.key]: e.target.value }))
              }
              onKeyDown={onKeyDown}
              placeholder="0"
              inputMode="decimal"
              aria-label={`${m.label} grams`}
              className="w-full min-w-0 bg-transparent text-right text-sm tabular-nums outline-none placeholder:text-[#a5988a]"
            />
            <span className="text-xs text-[#a5988a]">g</span>
          </label>
        ))}
        <motion.button
          type="button"
          onClick={submit}
          disabled={!canAdd}
          whileTap={{ scale: 0.9 }}
          aria-label="Add entry"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </motion.button>
      </div>
      <Suggestions rows={suggestions.rows} onPick={pick} />
    </div>
  )
}

// The response zone: history Suggestions below the pills. Height animates open
// and shut so nothing on the screen jumps (spec § Add flow, cross-cutting).
function Suggestions({
  rows,
  onPick,
}: {
  rows: Product[]
  onPick: (product: Product) => void
}) {
  return (
    <AnimatePresence initial={false}>
      {rows.length > 0 && (
        <motion.div
          key="zone"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={SPRING}
          className="overflow-hidden"
        >
          <ul className="mt-2 flex flex-col gap-1.5 pt-1">
            {rows.map((product) => (
              <li key={product.key}>
                <SuggestionRow product={product} onPick={() => onPick(product)} />
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SuggestionRow({
  product,
  onPick,
}: {
  product: Product
  onPick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onPick}
      whileTap={{ scale: 0.98 }}
      aria-label={`Use ${product.label}`}
      className="w-full rounded-2xl bg-input px-3 py-2 text-left"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{product.label}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              ×{product.useCount}
            </span>
          </div>
          <MacroChips nutrients={product} size="sm" />
        </div>
        <div className="shrink-0 text-sm font-semibold tabular-nums">
          {product.kcal}
          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
            kcal
          </span>
        </div>
      </div>
    </motion.button>
  )
}

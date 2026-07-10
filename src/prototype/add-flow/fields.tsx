/* eslint-disable react-refresh/only-export-components -- prototype: constants and components share a file on purpose */
// PROTOTYPE — issue #5. Shared add-card field primitives + form state + the
// history typeahead panel. The typeahead is deliberately identical across
// variants (its parameters are under test, not its placement); the AI
// interaction around these fields is what each variant does differently.
import * as React from "react"
import { Plus, Sparkles } from "lucide-react"

import { MACROS, type Entry, type MacroKey } from "./Shell"
import { MIN_QUERY_CHARS, suggest, type Food, type Suggestion } from "./engine"

export type FlagKey = MacroKey | "kcal"

export type FormValues = {
  label: string
  kcal: string
  p: string
  f: string
  c: string
}

const EMPTY: FormValues = { label: "", kcal: "", p: "", f: "", c: "" }

let nextId = 1

export function useAddForm() {
  const [values, setValues] = React.useState<FormValues>(EMPTY)
  const set = React.useCallback(
    (patch: Partial<FormValues>) =>
      setValues((v) => ({ ...v, ...patch })),
    []
  )
  const reset = React.useCallback(() => setValues(EMPTY), [])
  const buildEntry = React.useCallback((): Entry | null => {
    if (!values.label.trim()) return null
    return {
      id: `n${nextId++}`,
      label: values.label.trim(),
      kcal: Math.round(parseFloat(values.kcal) || 0),
      p: parseFloat(values.p) || 0,
      f: parseFloat(values.f) || 0,
      c: parseFloat(values.c) || 0,
    }
  }, [values])
  return { values, set, reset, buildEntry }
}

// Map an AI Food payload onto the numeric form fields. The label is NOT
// touched — the AI never renames what the user typed (user decision); its
// interpretation shows in the info row instead.
export function formFromFood(food: Food): Partial<FormValues> {
  const fmt = (n: number) => String(Math.round(n * 10) / 10)
  return {
    kcal: String(Math.round(food.calories)),
    p: fmt(food.protein_g),
    f: fmt(food.fat_g),
    c: fmt(food.carbs_g),
  }
}

export function flagsFromUncertain(fields: string[]): Set<FlagKey> {
  const flags = new Set<FlagKey>()
  for (const f of fields) {
    if (f === "calories" || f === "grams") flags.add("kcal")
    if (f === "protein_g") flags.add("p")
    if (f === "fat_g") flags.add("f")
    if (f === "carbs_g") flags.add("c")
  }
  return flags
}

// Flagged (uncertain) values: a clearly visible dashed outline, no extra
// characters in the field (user decision: no "~" after the P/F/C letters).
const flaggedOutline =
  "outline-2 outline-dashed outline-[#8f7c5e] -outline-offset-2 dark:outline-[#8a775c]"

export function FoodInput({
  value,
  onChange,
  onEnter,
  inputRef,
  disabled,
  trailing,
}: {
  value: string
  onChange: (v: string) => void
  onEnter?: () => void
  inputRef?: React.Ref<HTMLInputElement>
  disabled?: boolean
  trailing?: React.ReactNode
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder="What did you eat?"
        className={
          "w-full rounded-full bg-[#f3ecdd] px-4 py-2.5 text-sm outline-none placeholder:text-[#a5988a] disabled:opacity-60 dark:bg-[#211a12] " +
          (trailing ? "pr-10" : "")
        }
      />
      {trailing && (
        <div className="absolute inset-y-0 right-1.5 flex items-center">
          {trailing}
        </div>
      )}
    </div>
  )
}

export function KcalInput({
  value,
  onChange,
  flagged,
  busy,
  onClearFlag,
}: {
  value: string
  onChange: (v: string) => void
  flagged?: boolean
  busy?: boolean
  onClearFlag?: () => void
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => {
        if (flagged) {
          e.target.select()
          onClearFlag?.()
        }
      }}
      placeholder="kcal"
      inputMode="decimal"
      aria-label="Calories"
      className={
        // outline-none (focus reset) and the dashed flag outline are mutually
        // exclusive — both set outline-style, and the reset would win.
        "w-16 rounded-full bg-[#f3ecdd] px-3 py-2.5 text-center text-sm tabular-nums placeholder:text-[#a5988a] dark:bg-[#211a12] " +
        (flagged ? flaggedOutline : "outline-none") +
        (busy ? " animate-pulse" : "")
      }
    />
  )
}

export function MacroPillInput({
  macro,
  value,
  onChange,
  flagged,
  busy,
  onClearFlag,
}: {
  macro: (typeof MACROS)[number]
  value: string
  onChange: (v: string) => void
  flagged?: boolean
  busy?: boolean
  onClearFlag?: () => void
}) {
  return (
    <label
      className={
        "flex min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 py-2 " +
        (flagged ? flaggedOutline : "") +
        (busy ? " animate-pulse" : "")
      }
      style={{
        backgroundColor: `color-mix(in oklab, ${macro.color} 11%, transparent)`,
      }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: macro.color }}
      />
      <span className="text-xs font-medium text-[#7d7060] dark:text-[#a5988a]">
        {macro.letter}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          if (flagged) {
            e.target.select()
            onClearFlag?.()
          }
        }}
        placeholder="0"
        inputMode="decimal"
        aria-label={`${macro.label} grams`}
        className="w-full min-w-0 bg-transparent text-right text-sm tabular-nums outline-none placeholder:text-[#a5988a]"
      />
      <span className="text-xs text-[#a5988a]">g</span>
    </label>
  )
}

export function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="Add entry"
      onClick={onClick}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2b2015] text-[#f6f1e6] dark:bg-[#f3ece2] dark:text-[#17110c]"
    >
      <Plus className="h-5 w-5" strokeWidth={2.5} />
    </button>
  )
}

// Lives inside the food input — the AI acts on exactly that text.
export function AiButton({
  onClick,
  busy,
  disabled,
}: {
  onClick: () => void
  busy?: boolean
  disabled?: boolean
}) {
  return (
    <button
      aria-label="Fill with AI"
      onClick={onClick}
      disabled={busy || disabled}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#2b2015] hover:bg-[#e9dfc9] disabled:opacity-40 dark:text-[#f3ece2] dark:hover:bg-[#2a211a]"
    >
      <Sparkles className={"h-4 w-4" + (busy ? " animate-pulse" : "")} />
    </button>
  )
}

// History typeahead — renders inside the add card, directly under the input.
// Instant (sync), never waits on anything. Tap = add the past entry as-is.
//
// Word-by-word search (user decision): only the word currently being typed is
// searched ("10g butter" → first "10g", then "butter" once typing resumes
// after the space). The previous word's results stay visible until the next
// word produces results of its own.
export function TypeaheadPanel({
  query,
  onPick,
}: {
  query: string
  onPick: (s: Suggestion) => void
}) {
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([])
  // Sticky derived state — an effect on purpose. eslint-disable react-hooks/set-state-in-effect
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    if (!query.trim()) {
      setSuggestions([])
      return
    }
    const words = query.trim().split(/\s+/)
    const current = words[words.length - 1]
    if (current.length < MIN_QUERY_CHARS) return // keep previous word's results
    const next = suggest(current)
    if (next.length > 0) setSuggestions(next)
    // empty → keep previous word's results visible
  }, [query])
  /* eslint-enable react-hooks/set-state-in-effect */
  if (suggestions.length === 0) return null
  return (
    <div className="animate-in fade-in mt-2 flex flex-col overflow-hidden rounded-2xl bg-[#f3ecdd] duration-200 dark:bg-[#211a12]">
      {suggestions.map((s) => (
        <button
          key={s.label}
          onClick={() => onPick(s)}
          className="flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[#ece2cd] dark:hover:bg-[#2a211a]"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm">{s.label}</span>
            <span className="mt-0.5 flex gap-2 text-[11px] tabular-nums">
              {MACROS.filter((m) => s[m.key] > 0).map((m) => (
                <span key={m.key} style={{ color: m.textColor }}>
                  {m.letter} {s[m.key]}g
                </span>
              ))}
              <span className="text-[#a5988a]">×{s.uses}</span>
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {s.kcal}
            <span className="ml-1 text-[11px] font-normal text-[#7d7060] dark:text-[#a5988a]">
              kcal
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

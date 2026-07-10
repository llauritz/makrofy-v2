// PROTOTYPE — issue #5, Variant C "Direct add".
// Contract: maximum ease — a confident (or unsure) AI answer commits straight
// into today's list, no confirmation. Trust is repaired after the fact: an
// Undo snackbar, ~flags and the Google chip rendered on the entry itself.
// Only the ambiguous/hopeless tiers fall back to an inline row, because
// there's nothing to add yet.
import * as React from "react"
import { X } from "lucide-react"

import { MACROS, Shell, type Entry } from "./Shell"
import { mockMacroFill } from "./engine"
import {
  AddButton,
  AiButton,
  FoodInput,
  KcalInput,
  MacroPillInput,
  TypeaheadPanel,
  flagsFromUncertain,
  useAddForm,
} from "./fields"
import type { VariantProps } from "./index"

type AiPhase =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "question"; question: string; chips: string[] }
  | { kind: "hint"; hint: string }

type Snack = { entryId: string; message: string; formText: string }

let directEntryId = 1

export function VariantDirect({ entries, addEntry, removeEntry, seed }: VariantProps) {
  const { values, set, reset, buildEntry } = useAddForm()
  const [phase, setPhase] = React.useState<AiPhase>({ kind: "idle" })
  const [snack, setSnack] = React.useState<Snack | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const snackTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = React.useRef(true)
  React.useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (snackTimer.current) clearTimeout(snackTimer.current)
    }
  }, [])

  React.useEffect(() => {
    if (seed) {
      set({ label: seed.text })
      inputRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.nonce])

  const showSnack = (s: Snack) => {
    if (snackTimer.current) clearTimeout(snackTimer.current)
    setSnack(s)
    snackTimer.current = setTimeout(() => setSnack(null), 6000)
  }

  const runAi = (text: string) => {
    if (!text.trim()) return
    setPhase({ kind: "thinking" })
    mockMacroFill(text).then((reply) => {
      if (!alive.current) return
      const r = reply.result
      if (r.status === "confident" || r.status === "unsure") {
        const flagged = r.status === "unsure" ? [...flagsFromUncertain(r.uncertainFields)] : []
        const entry: Entry = {
          id: `c${directEntryId++}`,
          label: r.food.label,
          kcal: Math.round(r.food.calories),
          p: Math.round(r.food.protein_g * 10) / 10,
          f: Math.round(r.food.fat_g * 10) / 10,
          c: Math.round(r.food.carbs_g * 10) / 10,
          ai: {
            flagged,
            grounded: reply.grounded,
            searchQuery: reply.searchQuery,
          },
        }
        addEntry(entry)
        showSnack({
          entryId: entry.id,
          message:
            r.status === "unsure"
              ? `Added with estimates — ${entry.kcal} kcal`
              : `Added — ${entry.kcal} kcal`,
          formText: text,
        })
        reset()
        setPhase({ kind: "idle" })
      } else if (r.status === "ambiguous") {
        setPhase({ kind: "question", question: r.question, chips: r.chips })
      } else {
        setPhase({ kind: "hint", hint: r.hint })
      }
    })
  }

  const commit = () => {
    const entry = buildEntry()
    if (!entry) return
    addEntry(entry)
    reset()
    setPhase({ kind: "idle" })
  }

  const addCard = (
    <div className="mx-4 mt-1 rounded-3xl border border-[#eee5d2] bg-[#fffdf7] p-3 shadow-[0_1px_2px_rgba(43,32,21,0.05)] dark:border-[#3a2f22] dark:bg-[#2a211a]">
      <div className="flex items-center gap-2">
        <FoodInput
          inputRef={inputRef}
          value={values.label}
          onChange={(v) => {
            set({ label: v })
            if (phase.kind !== "idle") setPhase({ kind: "idle" })
          }}
          onEnter={commit}
          trailing={
            <AiButton
              onClick={() => runAi(values.label)}
              busy={phase.kind === "thinking"}
              disabled={!values.label.trim()}
            />
          }
        />
        <KcalInput
          value={values.kcal}
          onChange={(v) => set({ kcal: v })}
          busy={phase.kind === "thinking"}
        />
      </div>

      {phase.kind !== "question" && phase.kind !== "hint" && (
        <TypeaheadPanel
          query={values.label}
          onPick={(s) => {
            addEntry({
              id: `n${Date.now()}`,
              label: s.label,
              kcal: s.kcal,
              p: s.p,
              f: s.f,
              c: s.c,
            })
            reset()
          }}
        />
      )}

      {phase.kind === "question" && (
        <div className="mt-2 rounded-2xl bg-[#f3ecdd] px-4 py-3 dark:bg-[#211a12]">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm">{phase.question}</span>
            <button
              aria-label="Dismiss question"
              onClick={() => setPhase({ kind: "idle" })}
              className="mt-0.5 text-[#a5988a]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {phase.chips.map((chip) => (
              <button
                key={chip}
                onClick={() => runAi(chip)}
                className="rounded-full border border-[#e6dcc8] bg-[#fffdf7] px-3 py-1.5 text-xs font-medium dark:border-[#3a2f22] dark:bg-[#2a211a]"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase.kind === "hint" && (
        <div className="mt-2 flex items-start justify-between gap-2 rounded-2xl bg-[#f3ecdd] px-4 py-3 dark:bg-[#211a12]">
          <span className="text-sm text-[#7d7060] dark:text-[#a5988a]">
            Can’t estimate this one. {phase.hint}
          </span>
          <button
            aria-label="Dismiss hint"
            onClick={() => setPhase({ kind: "idle" })}
            className="mt-0.5 shrink-0 text-[#a5988a]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        {MACROS.map((m) => (
          <MacroPillInput
            key={m.key}
            macro={m}
            value={values[m.key]}
            onChange={(v) => set({ [m.key]: v })}
            busy={phase.kind === "thinking"}
          />
        ))}
        <AddButton onClick={commit} />
      </div>
      {phase.kind === "thinking" && (
        <div className="mt-2 px-1 text-[11px] text-[#7d7060] dark:text-[#a5988a]">
          Estimating — will add it for you…
        </div>
      )}
    </div>
  )

  const overlay = snack ? (
    <div className="fixed inset-x-0 bottom-40 z-40 mx-auto flex max-w-md justify-center px-6">
      <div className="animate-in fade-in slide-in-from-bottom-2 flex items-center gap-3 rounded-full bg-[#2b2015]/95 py-2 pr-2 pl-4 text-sm text-[#f6f1e6] shadow-lg duration-200 dark:bg-[#f3ece2]/95 dark:text-[#17110c]">
        <span>{snack.message}</span>
        <button
          onClick={() => {
            removeEntry(snack.entryId)
            set({ label: snack.formText })
            setSnack(null)
            inputRef.current?.focus()
          }}
          className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold dark:bg-black/10"
        >
          Undo
        </button>
      </div>
    </div>
  ) : null

  return <Shell entries={entries} addCard={addCard} overlay={overlay} />
}

// PROTOTYPE — issue #5, Variant A "Inline fill".
// Contract: the AI writes INTO the form fields; the Add button stays the one
// and only commit point. Every tier surfaces inside the add card itself —
// shimmering fields while thinking, dashed ~values when unsure, an inline
// question row with answer chips when ambiguous, a hint row when hopeless.
// Google attribution renders at the bottom of the card, never on entries.
import * as React from "react"
import { X } from "lucide-react"

import { GoogleChip, MACROS, Shell } from "./Shell"
import { mockMacroFill, type AiReply } from "./engine"
import {
  AddButton,
  AiButton,
  FoodInput,
  KcalInput,
  MacroPillInput,
  TypeaheadPanel,
  flagsFromUncertain,
  formFromFood,
  useAddForm,
  type FlagKey,
} from "./fields"
import type { VariantProps } from "./index"

type AiPhase =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "question"; question: string; chips: string[] }
  | { kind: "hint"; hint: string }

export function VariantInline({ entries, addEntry, seed }: VariantProps) {
  const { values, set, reset, buildEntry } = useAddForm()
  const [phase, setPhase] = React.useState<AiPhase>({ kind: "idle" })
  const [flags, setFlags] = React.useState<Set<FlagKey>>(new Set())
  const [interp, setInterp] = React.useState<string | null>(null)
  const [attribution, setAttribution] = React.useState<string | null>(null)
  // The typeahead opens only on text the user typed (or seeded) — never on a
  // label the AI wrote back, or it would cover the fill it just made.
  const [typeaheadOn, setTypeaheadOn] = React.useState(true)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const alive = React.useRef(true)
  React.useEffect(() => {
    alive.current = true
    return () => void (alive.current = false)
  }, [])

  const clearAiState = React.useCallback(() => {
    setPhase({ kind: "idle" })
    setFlags(new Set())
    setInterp(null)
    setAttribution(null)
  }, [])

  // Consuming the try-tray seed is inherently a set-state-in-effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    if (seed) {
      set({ label: seed.text })
      setTypeaheadOn(true)
      clearAiState()
      inputRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.nonce])
  /* eslint-enable react-hooks/set-state-in-effect */

  const applyReply = (reply: AiReply) => {
    const r = reply.result
    setAttribution(reply.grounded && reply.searchQuery ? reply.searchQuery : null)
    if (r.status === "confident" || r.status === "unsure") {
      set(formFromFood(r.food))
      setTypeaheadOn(false)
      setInterp(`${r.food.label} — ${r.food.servingText}`)
      setFlags(r.status === "unsure" ? flagsFromUncertain(r.uncertainFields) : new Set())
      setPhase({ kind: "idle" })
    } else if (r.status === "ambiguous") {
      setPhase({ kind: "question", question: r.question, chips: r.chips })
    } else {
      setPhase({ kind: "hint", hint: r.hint })
    }
  }

  const runAi = (text: string) => {
    if (!text.trim()) return
    setPhase({ kind: "thinking" })
    setInterp(null)
    setAttribution(null)
    setFlags(new Set())
    mockMacroFill(text).then((reply) => {
      if (alive.current) applyReply(reply)
    })
  }

  const commit = () => {
    const entry = buildEntry()
    if (!entry) return
    addEntry(entry)
    reset()
    clearAiState()
  }

  const thinking = phase.kind === "thinking"
  const clearFlag = (key: FlagKey) =>
    setFlags((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })

  const addCard = (
    <div className="mx-4 mt-1 rounded-3xl border border-[#eee5d2] bg-[#fffdf7] p-3 shadow-[0_1px_2px_rgba(43,32,21,0.05)] dark:border-[#3a2f22] dark:bg-[#2a211a]">
      <div className="flex items-center gap-2">
        <FoodInput
          inputRef={inputRef}
          value={values.label}
          onChange={(v) => {
            set({ label: v })
            setTypeaheadOn(true)
            if (phase.kind !== "idle" || interp) clearAiState()
          }}
          onEnter={commit}
          trailing={
            <AiButton
              onClick={() => runAi(values.label)}
              busy={thinking}
              disabled={!values.label.trim()}
            />
          }
        />
        <KcalInput
          value={values.kcal}
          onChange={(v) => set({ kcal: v })}
          flagged={flags.has("kcal")}
          busy={thinking}
          onClearFlag={() => clearFlag("kcal")}
        />
      </div>

      {typeaheadOn && phase.kind !== "question" && phase.kind !== "hint" && (
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
            clearAiState()
          }}
        />
      )}

      {phase.kind === "question" && (
        <div className="mt-2 rounded-2xl bg-[#f3ecdd] px-4 py-3 dark:bg-[#211a12]">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm">{phase.question}</span>
            <button
              aria-label="Dismiss question"
              onClick={clearAiState}
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
            onClick={clearAiState}
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
            flagged={flags.has(m.key)}
            busy={thinking}
            onClearFlag={() => clearFlag(m.key)}
          />
        ))}
        <AddButton onClick={commit} />
      </div>

      {(thinking || interp || flags.size > 0 || attribution) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 text-[11px] text-[#7d7060] dark:text-[#a5988a]">
          {thinking && <span>Estimating…</span>}
          {interp && <span className="truncate">{interp}</span>}
          {flags.size > 0 && <span>Best guess — tap a dashed value to adjust.</span>}
          {attribution && <GoogleChip query={attribution} />}
        </div>
      )}
    </div>
  )

  return <Shell entries={entries} addCard={addCard} />
}

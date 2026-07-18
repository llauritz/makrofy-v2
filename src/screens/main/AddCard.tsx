import * as React from "react"
import { Plus, Sparkles } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import type { EntrySource } from "@/data/entries"
import { useI18n } from "@/lib/i18n/useI18n"
import { fillValuesFrom, flaggedFieldsFrom } from "@/lib/macro-fill"
import {
  advanceSuggestions,
  EMPTY_INDEX,
  EMPTY_SUGGESTIONS,
  type ProductIndex,
  type SuggestionRow,
} from "@/lib/suggestions"
import { useOnline } from "@/lib/useOnline"
import { AiZone } from "./AiZone"
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
  aiZoneStateOf,
  FLAGGED_OUTLINE,
  NO_FLAGS,
  useAiFill,
  useFormFlags,
} from "./useAiFill"

// Label + kcal on top, tinted P/F/C gram pills + ink Add below, and — inside
// the same card, below the pills — the response zone that hosts history
// Suggestions (spec § Add flow, issues #18/#37) and every AI surface (#21).
// Only Add commits: a Suggestion tap and an AI fill both write into the form
// (source 'history' / 'ai') and never the day log. The AI fills numbers only,
// never the label; unsure numbers carry a dashed Flagged outline until tapped.
// The round-trip choreography itself lives in useAiFill, shared with the
// editor and the 0-kcal row surfaces (#53); here a fill overwrites the whole
// form and its flags. #a5988a (not muted-foreground) for placeholders and the
// "g" unit in BOTH modes matches the record screenshots (issue #4).

export function AddCard({
  onAdd,
  index = EMPTY_INDEX,
  uid = null,
}: {
  onAdd: (draft: EntryDraft, source: EntrySource) => void
  index?: ProductIndex
  /** The identity behind the card. The AI button requires one (Guests count,
   * spec § AI macro-fill); null disables the whole card, as before. */
  uid?: string | null
}) {
  const { t } = useI18n()
  const [label, setLabel] = React.useState("")
  const [kcal, setKcal] = React.useState("")
  const [macros, setMacros] = React.useState(EMPTY_MACROS)
  // Whether the current form contents came from a Suggestion tap or an AI
  // fill. Typing in the label makes it a manual Entry again.
  const [source, setSource] = React.useState<EntrySource>("manual")
  const [suggestions, setSuggestions] = React.useState(EMPTY_SUGGESTIONS)
  const { flags, setFlags, acceptFlag } = useFormFlags()
  const ai = useAiFill({
    uid,
    // An add-card fill overwrites the whole draft: every number, the 'ai'
    // provenance, and the flag set.
    apply: (food, newFlags) => {
      const values = fillValuesFrom(food)
      setKcal(values.kcal)
      setMacros({ p: values.p, f: values.f, c: values.c })
      setSource("ai")
      setFlags(newFlags)
    },
  })
  const online = useOnline()
  const labelRef = React.useRef<HTMLInputElement>(null)

  const disabled = uid === null
  // A blank-kcal Entry is intentional (0-kcal, dashed) — a label is the only
  // requirement to commit.
  const canAdd = label.trim() !== "" && !disabled
  const thinking = ai.thinking

  // Drop every AI trace and invalidate any reply still in flight.
  const clearAi = () => {
    ai.clear()
    setFlags(NO_FLAGS)
  }

  const reset = () => {
    setLabel("")
    setKcal("")
    setMacros(EMPTY_MACROS)
    setSource("manual")
    setSuggestions(EMPTY_SUGGESTIONS)
    clearAi()
  }

  const submit = () => {
    if (!canAdd) return
    // Flags still standing at commit persist on the Entry (ADR 0003).
    const flagged = source === "ai" ? flaggedFieldsFrom(flags) : []
    onAdd(
      {
        label: label.trim(),
        kcal: parseOptional(kcal) ?? 0,
        ...parseMacros(macros),
        ...(flagged.length > 0 ? { flagged } : {}),
      },
      source
    )
    reset()
    labelRef.current?.focus()
  }

  // Every label edit re-runs the sticky word-by-word search and drops any
  // 'history'/'ai' provenance — the user is describing their own food now.
  const onLabelChange = (value: string) => {
    setLabel(value)
    setSource("manual")
    setSuggestions((prev) => advanceSuggestions(prev, value, index))
    if (
      ai.phase.kind !== "idle" ||
      ai.interpretation ||
      ai.attribution ||
      flags.size > 0
    ) {
      clearAi()
    }
  }

  // A tap fills the row's numbers, marks the draft 'history', and collapses
  // the zone — it commits nothing. A baseline row (no Quantity typed) fills
  // its historical label too; a scaled row leaves the typed label alone — it
  // is the truth the numbers were scaled to (#37).
  const pick = (row: SuggestionRow) => {
    if (row.fillLabel !== undefined) setLabel(row.fillLabel)
    setKcal(String(row.kcal))
    setMacros(macroInputsFrom(row))
    setSource("history")
    setSuggestions(EMPTY_SUGGESTIONS)
    clearAi()
    labelRef.current?.focus()
  }

  // Both round trips (the ✨ tap and a chip answer) leave a clean slate: the
  // typeahead collapses and any prior fill's flags drop before the reply.
  const startAi = () => {
    const description = label.trim()
    if (disabled || thinking || description === "") return
    setSuggestions(EMPTY_SUGGESTIONS)
    setFlags(NO_FLAGS)
    ai.start(description)
  }

  // A chip answer triggers the second and final round trip (#5, #21).
  const answerQuestion = (chip: string) => {
    setSuggestions(EMPTY_SUGGESTIONS)
    setFlags(NO_FLAGS)
    ai.answer(chip)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      submit()
    }
  }

  const zoneState = aiZoneStateOf(ai, flags.size > 0)

  return (
    <div className="mx-4 mt-1 rounded-3xl border bg-card p-3 shadow-[0_1px_2px_rgba(43,32,21,0.05)]">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            ref={labelRef}
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t.addCard.placeholder}
            aria-label={t.addCard.food}
            className="w-full rounded-full bg-input py-3 pr-10 pl-4 text-sm outline-none placeholder:text-[#a5988a]"
          />
          <div className="absolute inset-y-0 right-1.5 flex items-center">
            <motion.button
              type="button"
              onClick={startAi}
              disabled={disabled || thinking || label.trim() === ""}
              whileTap={{ scale: 0.9 }}
              aria-label={t.addCard.fillWithAi}
              className={
                "flex h-7 w-7 items-center justify-center rounded-full transition-opacity disabled:opacity-40" +
                // Offline the button dims in place but stays tappable — the
                // tap answers with the quiet connection note in the zone.
                (online ? "" : " opacity-40")
              }
            >
              <Sparkles
                className={"h-4 w-4" + (thinking ? " animate-pulse" : "")}
              />
            </motion.button>
          </div>
        </div>
        <input
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={acceptFlag("kcal")}
          placeholder={t.units.kcal}
          inputMode="decimal"
          aria-label={t.addCard.calories}
          className={
            "w-16 rounded-full bg-input px-3 py-3 text-center text-sm tabular-nums placeholder:text-[#a5988a] " +
            // outline-none (focus reset) and the dashed flag outline are
            // mutually exclusive — both set outline-style.
            (flags.has("kcal") ? FLAGGED_OUTLINE : "outline-none") +
            (thinking ? " animate-pulse" : "")
          }
        />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        {MACROS.map((m) => (
          <label
            key={m.key}
            className={
              "flex min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 py-2.5" +
              (flags.has(m.key) ? " " + FLAGGED_OUTLINE : "") +
              (thinking ? " animate-pulse" : "")
            }
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
              onFocus={acceptFlag(m.key)}
              placeholder="0"
              inputMode="decimal"
              aria-label={t.macros.grams(t.macros[m.field])}
              className="w-full min-w-0 bg-transparent text-right text-sm tabular-nums outline-none placeholder:text-[#a5988a]"
            />
            <span className="text-xs text-[#a5988a]">{t.units.g}</span>
          </label>
        ))}
        <motion.button
          type="button"
          onClick={submit}
          disabled={!canAdd}
          whileTap={{ scale: 0.9 }}
          aria-label={t.addCard.addEntry}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </motion.button>
      </div>
      <Suggestions rows={suggestions.rows} onPick={pick} />
      <AiZone
        state={zoneState}
        attribution={ai.attribution}
        onAnswer={answerQuestion}
        onDismiss={clearAi}
      />
    </div>
  )
}

// The response zone: history Suggestions below the pills. Height animates open
// and shut so nothing on the screen jumps (spec § Add flow, cross-cutting).
function Suggestions({
  rows,
  onPick,
}: {
  rows: SuggestionRow[]
  onPick: (row: SuggestionRow) => void
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
            {rows.map((row) => (
              <li key={row.key}>
                <Suggestion row={row} onPick={() => onPick(row)} />
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// One Suggestion row: label, ×votes, and — on a scaled row (#37) — the muted
// base hint ("30g · 90") naming the portion the numbers scaled from. Plain
// muted text, never dashed: dashed styling means AI Flagged values.
function Suggestion({
  row,
  onPick,
}: {
  row: SuggestionRow
  onPick: () => void
}) {
  const { t, n } = useI18n()
  return (
    <motion.button
      type="button"
      onClick={onPick}
      whileTap={{ scale: 0.98 }}
      aria-label={t.addCard.use(row.label)}
      className="w-full rounded-2xl bg-input px-3 py-2 text-left"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{row.label}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              ×{row.useCount}
            </span>
            {row.hint && (
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {row.hint}
              </span>
            )}
          </div>
          <MacroChips nutrients={row} size="sm" />
        </div>
        <div className="shrink-0 text-sm font-semibold tabular-nums">
          {n(row.kcal)}
          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
            {t.units.kcal}
          </span>
        </div>
      </div>
    </motion.button>
  )
}

import * as React from "react"
import { Check, Sparkles, Trash2, X } from "lucide-react"
import { motion } from "motion/react"

import type { Entry, EntryEdit } from "@/data/entries"
import { useI18n } from "@/lib/i18n/useI18n"
import {
  fillableFrom,
  fillValuesFrom,
  flaggedFieldsFrom,
  formFlagsFrom,
  promptFrom,
} from "@/lib/macro-fill"
import { useOnline } from "@/lib/useOnline"
import { AiZone, type AiZoneState } from "./AiZone"
import {
  knownFromInputs,
  macroInputsFrom,
  parseMacros,
  parseOptional,
} from "./fields"
import { MACROS, macroTint } from "./macros"
import {
  aiZoneStateOf,
  FLAGGED_OUTLINE,
  useAiFill,
  useFormFlags,
} from "./useAiFill"

// The inline editor an Entry row fade-throughs to on tap. Chrome-less: the
// border and background live on EntryList's FadeSwap box, which makes the
// space while row and editor contents fade (spec § Motion). Same field
// grammar as the add card — including its ✨ in the label input (#53) — plus
// Delete / Cancel / Save. An editor fill completes only what was blank at the
// ✨ tap: the typed values anchor the prompt and are never overwritten, and
// the model's doubt lands only on fields it actually filled. The dashed
// outlines seed from the Entry's persisted flags, giving a committed
// best-guess its review surface; Save persists the flags still standing.
// Delete routes through the parent's deferred-delete + undo (ADR 0004); it
// never writes here.
export function EntryEditor({
  entry,
  uid = null,
  onSave,
  onCancel,
  onDelete,
}: {
  entry: Entry
  /** The identity behind the ✨ (Guests count); null disables only the AI. */
  uid?: string | null
  onSave: (edit: EntryEdit) => void
  onCancel: () => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  const [label, setLabel] = React.useState(entry.label)
  const [kcal, setKcal] = React.useState(String(entry.kcal))
  const [macros, setMacros] = React.useState(() => macroInputsFrom(entry))
  // Whether this session's values carry an applied ✨ fill — Save then
  // restamps the provenance (the add card's rule: committed AI values carry
  // ✨; rewriting the label makes it the user's own food again).
  const [aiFilled, setAiFilled] = React.useState(false)
  const { flags, setFlags, acceptFlag } = useFormFlags(
    formFlagsFrom(entry.flagged)
  )
  const ai = useAiFill({
    uid,
    // Complete only what was blank at the ✨ tap; typed values are the
    // anchor, never the target. New doubt joins the seeded flags, but only
    // where the fill actually wrote.
    apply: (food, newFlags) => {
      const fillable = fillableFrom(knownFromInputs(kcal, macros))
      const values = fillValuesFrom(food)
      if (fillable.has("kcal")) setKcal(values.kcal)
      setMacros((prev) => ({
        p: fillable.has("p") ? values.p : prev.p,
        f: fillable.has("f") ? values.f : prev.f,
        c: fillable.has("c") ? values.c : prev.c,
      }))
      setFlags((prev) => {
        const next = new Set(prev)
        for (const flag of newFlags) if (fillable.has(flag)) next.add(flag)
        return next
      })
      setAiFilled(true)
    },
  })
  const online = useOnline()

  const canSave = label.trim() !== ""
  // What a fill could still write — also which fields pulse while thinking.
  const fillable = fillableFrom(knownFromInputs(kcal, macros))

  const save = () => {
    if (!canSave) return
    onSave({
      label: label.trim(),
      kcal: parseOptional(kcal) ?? 0,
      ...parseMacros(macros),
      // The editor reconciles flags (#53, amending ADR 0003): survivors of
      // tap-to-accept persist, an emptied set clears the Entry's field.
      flagged: flaggedFieldsFrom(flags),
      ...(aiFilled ? { source: "ai" as const } : {}),
    })
  }

  // A rewritten label invalidates the AI's reading of it — and the pending
  // ✨ restamp — but not the flags: they belong to the values, which an edit
  // to the label doesn't change.
  const onLabelChange = (value: string) => {
    setLabel(value)
    setAiFilled(false)
    if (ai.phase.kind !== "idle" || ai.interpretation || ai.attribution) {
      ai.clear()
    }
  }

  // Nothing blank means nothing to fill: the ✨ disables rather than spend a
  // round trip writing nothing. Blanking a field is the re-estimate gesture.
  const canFill = fillable.size > 0

  const startAi = () => {
    const description = label.trim()
    if (uid === null || ai.thinking || !canFill || description === "") return
    ai.start(promptFrom(description, knownFromInputs(kcal, macros)))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      save()
    } else if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }

  // Seeded flags with nothing else to show still get the flag-help line, so
  // a dashed outline opened weeks after its commit explains itself.
  const zoneState: AiZoneState = (() => {
    const state = aiZoneStateOf(ai, flags.size > 0)
    return state.kind === "empty" && flags.size > 0
      ? { kind: "filled", interpretation: "", anyFlagged: true }
      : state
  })()

  return (
    <div className="p-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            autoFocus
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={t.addCard.food}
            className="w-full rounded-full bg-input py-2.5 pr-10 pl-4 text-sm outline-none placeholder:text-[#a5988a]"
          />
          <div className="absolute inset-y-0 right-1.5 flex items-center">
            <motion.button
              type="button"
              onClick={startAi}
              disabled={
                uid === null || ai.thinking || !canFill || label.trim() === ""
              }
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
                className={"h-4 w-4" + (ai.thinking ? " animate-pulse" : "")}
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
            "w-16 rounded-full bg-input px-3 py-2.5 text-center text-sm tabular-nums placeholder:text-[#a5988a] " +
            // outline-none (focus reset) and the dashed flag outline are
            // mutually exclusive — both set outline-style.
            (flags.has("kcal") ? FLAGGED_OUTLINE : "outline-none") +
            (ai.thinking && fillable.has("kcal") ? " animate-pulse" : "")
          }
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        {MACROS.map((m) => (
          <label
            key={m.key}
            className={
              "flex min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 py-2" +
              (flags.has(m.key) ? " " + FLAGGED_OUTLINE : "") +
              (ai.thinking && fillable.has(m.key) ? " animate-pulse" : "")
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
      </div>
      <AiZone
        state={zoneState}
        attribution={ai.attribution}
        onAnswer={ai.answer}
        onDismiss={ai.clear}
      />
      <div className="mt-2.5 flex items-center justify-between">
        <motion.button
          type="button"
          onClick={onDelete}
          whileTap={{ scale: 0.9 }}
          aria-label={t.entryEditor.deleteEntry}
          className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          {t.common.delete}
        </motion.button>
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={onCancel}
            whileTap={{ scale: 0.9 }}
            aria-label={t.entryEditor.cancel}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-input text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </motion.button>
          <motion.button
            type="button"
            onClick={save}
            disabled={!canSave}
            whileTap={{ scale: 0.9 }}
            aria-label={t.entryEditor.saveChanges}
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <Check className="h-4 w-4" strokeWidth={2.5} />
            {t.common.save}
          </motion.button>
        </div>
      </div>
    </div>
  )
}

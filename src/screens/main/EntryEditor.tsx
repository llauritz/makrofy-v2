import * as React from "react"
import { Check, Trash2, X } from "lucide-react"
import { motion } from "motion/react"

import type { Entry, EntryEdit } from "@/data/entries"
import {
  macroInputsFrom,
  parseMacros,
  parseOptional,
} from "./fields"
import { MACROS, macroTint } from "./macros"

// The inline editor an Entry row swaps to on tap. Same field grammar as the
// add card, plus Delete / Cancel / Save. Delete routes through the parent's
// deferred-delete + undo (ADR 0004); it never writes here.
export function EntryEditor({
  entry,
  onSave,
  onCancel,
  onDelete,
}: {
  entry: Entry
  onSave: (edit: EntryEdit) => void
  onCancel: () => void
  onDelete: () => void
}) {
  const [label, setLabel] = React.useState(entry.label)
  const [kcal, setKcal] = React.useState(String(entry.kcal))
  const [macros, setMacros] = React.useState(() => macroInputsFrom(entry))

  const canSave = label.trim() !== ""

  const save = () => {
    if (!canSave) return
    onSave({
      label: label.trim(),
      kcal: parseOptional(kcal) ?? 0,
      ...parseMacros(macros),
    })
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

  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={onKeyDown}
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
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <motion.button
          type="button"
          onClick={onDelete}
          whileTap={{ scale: 0.9 }}
          aria-label="Delete entry"
          className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </motion.button>
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={onCancel}
            whileTap={{ scale: 0.9 }}
            aria-label="Cancel"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-input text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </motion.button>
          <motion.button
            type="button"
            onClick={save}
            disabled={!canSave}
            whileTap={{ scale: 0.9 }}
            aria-label="Save changes"
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <Check className="h-4 w-4" strokeWidth={2.5} />
            Save
          </motion.button>
        </div>
      </div>
    </div>
  )
}

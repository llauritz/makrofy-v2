import { Sparkles } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import type { Entry, EntryEdit } from "@/data/entries"
import { SPRING } from "./anim"
import { EntryEditor } from "./EntryEditor"
import { FadeSwap } from "./FadeSwap"
import { MacroChips } from "./MacroChips"

// The day's Entries, newest first (the parent reverses log order) with the
// deferred-deletes already hidden. Spec conventions: no times; macro chips
// only for macros actually logged; 0-kcal Entries dashed with a muted number
// (#a5988a in BOTH modes, per the record screenshots, issue #4). Tapping a row
// fade-throughs to the inline editor: the card's box makes the space, the
// content fades, the rows below are pushed in lockstep (spec § Motion). The
// card chrome lives on the FadeSwap box so the card persists across the swap;
// `layout` is position-only — size interpolation would stretch (ADR 0007).
export function EntryList({
  entries,
  editingId,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  entries: Entry[]
  editingId: string | null
  onStartEdit: (id: string) => void
  onSaveEdit: (id: string, edit: EntryEdit) => void
  onCancelEdit: () => void
  onDelete: (entry: Entry) => void
}) {
  return (
    <div className="mx-4 mt-3 pb-3">
      <AnimatePresence mode="popLayout" initial={false}>
        {entries.length === 0 ? (
          <motion.div
            key="empty"
            layout="position"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-dashed border-[#cbbfa4] px-4 py-8 text-center dark:border-[#4a3e2e]"
          >
            <div className="text-[15px] font-medium">Nothing logged yet</div>
            <div className="mt-1 text-xs text-muted-foreground">
              What you log for this day shows up here.
            </div>
          </motion.div>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => {
              const editing = editingId === entry.id
              // A 0-kcal row is dashed; the editor is always a solid card. The
              // chrome flips at the swap, while the contents are mid-fade.
              const dashed = entry.kcal === 0 && !editing
              return (
                <motion.li
                  key={entry.id}
                  layout="position"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={SPRING}
                >
                  <FadeSwap
                    swapKey={editing ? "editor" : "row"}
                    className={
                      "rounded-2xl " +
                      (dashed
                        ? "border border-dashed border-[#cbbfa4] dark:border-[#4a3e2e]"
                        : "border bg-card")
                    }
                  >
                    {editing ? (
                      <EntryEditor
                        entry={entry}
                        onSave={(edit) => onSaveEdit(entry.id, edit)}
                        onCancel={onCancelEdit}
                        onDelete={() => onDelete(entry)}
                      />
                    ) : (
                      <EntryRow
                        entry={entry}
                        onEdit={() => onStartEdit(entry.id)}
                      />
                    )}
                  </FadeSwap>
                </motion.li>
              )
            })}
          </ul>
        )}
      </AnimatePresence>
    </div>
  )
}

// Chrome-less (border and background live on the FadeSwap box around it).
function EntryRow({ entry, onEdit }: { entry: Entry; onEdit: () => void }) {
  const noKcal = entry.kcal === 0
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Edit ${entry.label}`}
      className="w-full rounded-2xl px-4 py-3 text-left"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-medium">{entry.label}</span>
            {/* The ✨ provenance marker behind the name (spec § AI macro-fill):
                attribution showed in the card at response time, so the Entry
                carries only this quiet mark. */}
            {entry.source === "ai" && (
              <Sparkles aria-label="AI-assisted" className="h-3 w-3 shrink-0 text-[#a5988a]" />
            )}
          </div>
          <MacroChips nutrients={entry} />
        </div>
        <div
          className={
            "shrink-0 text-[15px] font-semibold tabular-nums " +
            (noKcal ? "text-[#a5988a]" : "")
          }
        >
          {entry.kcal}
          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
            kcal
          </span>
        </div>
      </div>
    </button>
  )
}

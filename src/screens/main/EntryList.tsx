import { AnimatePresence, motion } from "motion/react"

import type { Entry, EntryEdit } from "@/data/entries"
import { SPRING } from "./anim"
import { EntryEditor } from "./EntryEditor"
import { MacroChips } from "./MacroChips"

// The day's Entries, newest first (the parent reverses log order) with the
// deferred-deletes already hidden. Spec conventions: no times; macro chips
// only for macros actually logged; 0-kcal Entries dashed with a muted number
// (#a5988a in BOTH modes, per the record screenshots, issue #4). Tapping a row
// swaps it for the inline editor; everything animates, nothing jumps.
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
            layout
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
            {entries.map((entry) => (
              <motion.li
                key={entry.id}
                layout
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={SPRING}
              >
                {editingId === entry.id ? (
                  <EntryEditor
                    entry={entry}
                    onSave={(edit) => onSaveEdit(entry.id, edit)}
                    onCancel={onCancelEdit}
                    onDelete={() => onDelete(entry)}
                  />
                ) : (
                  <EntryRow entry={entry} onEdit={() => onStartEdit(entry.id)} />
                )}
              </motion.li>
            ))}
          </ul>
        )}
      </AnimatePresence>
    </div>
  )
}

function EntryRow({ entry, onEdit }: { entry: Entry; onEdit: () => void }) {
  const noKcal = entry.kcal === 0
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Edit ${entry.label}`}
      className={
        "w-full rounded-2xl px-4 py-3 text-left " +
        (noKcal
          ? "border border-dashed border-[#cbbfa4] dark:border-[#4a3e2e]"
          : "border bg-card")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">{entry.label}</div>
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

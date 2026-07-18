import { Sparkles } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import type { Entry, EntryAiFill, EntryEdit } from "@/data/entries"
import { useI18n } from "@/lib/i18n/useI18n"
import { entryFillFrom, knownFromEntry, promptFrom } from "@/lib/macro-fill"
import { useOnline } from "@/lib/useOnline"
import { AiZone } from "./AiZone"
import { SPRING } from "./anim"
import { EntryEditor } from "./EntryEditor"
import { FadeSwap } from "./FadeSwap"
import { MacroChips } from "./MacroChips"
import { aiZoneStateOf, useAiFill } from "./useAiFill"

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
  uid = null,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onAiFill,
}: {
  entries: Entry[]
  editingId: string | null
  /** The identity behind the ✨ surfaces (Guests count); null disables them. */
  uid?: string | null
  onStartEdit: (id: string) => void
  onSaveEdit: (id: string, edit: EntryEdit) => void
  onCancelEdit: () => void
  onDelete: (entry: Entry) => void
  /** A row-level AI fill landing on a logged Entry (#53). */
  onAiFill: (id: string, fill: EntryAiFill) => void
}) {
  const { t } = useI18n()
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
            <div className="text-[15px] font-medium">
              {t.entryList.emptyTitle}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t.entryList.emptyBody}
            </div>
          </motion.div>
        ) : (
          <ul className="flex flex-col gap-2.5">
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
                        uid={uid}
                        onSave={(edit) => onSaveEdit(entry.id, edit)}
                        onCancel={onCancelEdit}
                        onDelete={() => onDelete(entry)}
                      />
                    ) : (
                      <EntryRow
                        entry={entry}
                        uid={uid}
                        onEdit={() => onStartEdit(entry.id)}
                        onAiFill={(fill) => onAiFill(entry.id, fill)}
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
// A tap anywhere on the row opens the editor; a dashed 0-kcal row also
// carries the ✨ left of its muted number (#53), whose fill answers inside
// this same card through the response zone below — the add card's grammar.
// A confident answer commits the Entry's missing fields directly (the Entry
// is already logged; the ✨ tap is the intent — ADR 0010); its note and any
// Search attribution stay up, dismissible, after the fill.
function EntryRow({
  entry,
  uid,
  onEdit,
  onAiFill,
}: {
  entry: Entry
  uid: string | null
  onEdit: () => void
  onAiFill: (fill: EntryAiFill) => void
}) {
  const { t, n } = useI18n()
  const online = useOnline()
  const ai = useAiFill({
    uid,
    // The fill lands on the Entry itself: only the missing fields, with the
    // model's doubts persisting as flags on what it wrote (entryFillFrom).
    apply: (food, doubts) =>
      onAiFill(entryFillFrom(knownFromEntry(entry), food, doubts)),
  })
  const noKcal = entry.kcal === 0

  const startAi = () => {
    if (ai.thinking) return
    ai.start(promptFrom(entry.label, knownFromEntry(entry)))
  }

  return (
    // The whole row is one edit target (as the old row-button was), with the
    // ✨ and the zone's own controls opting out of the bubble — real nested
    // <button>s would be invalid HTML, so only the label block is one, and
    // its Enter-key click bubbles up here too.
    <div
      onClick={onEdit}
      className="w-full cursor-pointer rounded-2xl px-4 py-4"
    >
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label={t.entryList.edit(entry.label)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-medium">
              {entry.label}
            </span>
            {/* The ✨ provenance marker behind the name (spec § AI macro-fill):
                attribution showed in the card at response time, so the Entry
                carries only this quiet mark. */}
            {entry.source === "ai" && (
              <Sparkles
                aria-label={t.entryList.aiAssisted}
                className="h-3 w-3 shrink-0 text-[#a5988a]"
              />
            )}
          </div>
          <MacroChips nutrients={entry} />
        </button>
        {noKcal && (
          <motion.button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              startAi()
            }}
            disabled={uid === null || ai.thinking}
            whileTap={{ scale: 0.9 }}
            aria-label={t.addCard.fillWithAi}
            className={
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-40" +
              // Offline the button dims in place but stays tappable — the
              // tap answers with the quiet connection note in the zone.
              (online ? "" : " opacity-40")
            }
          >
            <Sparkles
              className={"h-4 w-4" + (ai.thinking ? " animate-pulse" : "")}
            />
          </motion.button>
        )}
        <div
          className={
            "shrink-0 text-[15px] font-semibold tabular-nums " +
            (noKcal ? "text-[#a5988a]" : "") +
            (ai.thinking ? " animate-pulse" : "")
          }
        >
          {n(entry.kcal)}
          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
            {t.units.kcal}
          </span>
        </div>
      </div>
      {/* The zone's chips and dismiss are their own targets, not edit taps. */}
      <div onClick={(e) => e.stopPropagation()}>
        <AiZone
          state={aiZoneStateOf(ai, false, { dismissibleFill: true })}
          attribution={ai.attribution}
          onAnswer={ai.answer}
          onDismiss={ai.clear}
        />
      </div>
    </div>
  )
}

import { motion } from "motion/react"

import { useI18n } from "@/lib/i18n/useI18n"
import { SPRING } from "./anim"

// The "entry deleted — undo" bar for a deferred delete (ADR 0004). It is pure
// UI: the parent holds the in-memory timer and commits the real delete only
// when the window lapses, so nothing touches Firestore until then.
export function UndoSnackbar({ onUndo }: { onUndo: () => void }) {
  const { t } = useI18n()
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={SPRING}
      className="mb-2 flex items-center justify-between gap-3 rounded-full bg-foreground py-2.5 pr-2.5 pl-4 text-background shadow-[0_8px_30px_rgba(43,32,21,0.2)]"
    >
      <span className="text-sm font-medium">{t.undoBar.entryDeleted}</span>
      <button
        type="button"
        onClick={onUndo}
        className="rounded-full bg-background/15 px-3 py-1 text-sm font-semibold"
      >
        {t.common.undo}
      </button>
    </motion.div>
  )
}

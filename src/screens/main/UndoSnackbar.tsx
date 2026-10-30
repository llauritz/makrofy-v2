import { motion } from "motion/react"

import { useI18n } from "@/lib/i18n/useI18n"
import { SPRING } from "./anim"
import { Squircle } from "@/components/ui/squircle"

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
      // The squircle's clip would erase a box-shadow, so the bar's shadow
      // hangs here as a drop-shadow, tracing the clipped silhouette.
      className="mb-2 drop-shadow-[0_8px_30px_rgba(43,32,21,0.2)]"
    >
      <Squircle
        pill
        className="flex items-center justify-between gap-3 rounded-full bg-foreground py-2.5 pr-2.5 pl-4 text-background"
      >
        <span className="text-sm font-medium">{t.undoBar.entryDeleted}</span>
        <Squircle asChild pill>
          <button
            type="button"
            onClick={onUndo}
            className="rounded-full bg-background/15 px-3 py-1 text-sm font-semibold"
          >
            {t.common.undo}
          </button>
        </Squircle>
      </Squircle>
    </motion.div>
  )
}

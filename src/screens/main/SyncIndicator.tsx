import { CircleAlert, CloudOff } from "lucide-react"
import * as React from "react"

import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet"
import { useI18n } from "@/lib/i18n/useI18n"
import type { SyncStatus } from "@/lib/sync"

// The header sync indicator (spec § PWA & offline, #19). Silent when synced —
// it renders nothing, so a healthy app shows no chrome for it at all. Pending
// (offline / queued writes) shows a quiet cloud whose tap explains in plain
// words. Attention (an auth-expired write pause) shows a firmer mark whose tap
// re-auths. No spinners: the icons are static, state changes are just a swap.
export function SyncIndicator({
  status,
  onReauth,
}: {
  status: SyncStatus
  onReauth: () => void
}) {
  const { t } = useI18n()
  const [explainOpen, setExplainOpen] = React.useState(false)

  if (status === "synced") return null

  if (status === "attention") {
    return (
      <button
        type="button"
        onClick={onReauth}
        aria-label={t.sync.attention}
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors"
      >
        <CircleAlert className="h-[18px] w-[18px]" />
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setExplainOpen(true)}
        aria-label={t.sync.pending}
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
      >
        <CloudOff className="h-[18px] w-[18px]" />
      </button>

      <BottomSheet open={explainOpen} onOpenChange={setExplainOpen}>
        <BottomSheetContent className="gap-4">
          <div className="flex items-start justify-between gap-3">
            <BottomSheetTitle className="text-lg font-semibold">
              {t.sync.savedTitle}
            </BottomSheetTitle>
            <BottomSheetClose />
          </div>
          <BottomSheetDescription className="text-[15px] text-muted-foreground">
            {t.sync.savedBody}
          </BottomSheetDescription>
        </BottomSheetContent>
      </BottomSheet>
    </>
  )
}

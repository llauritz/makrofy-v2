import { Settings2 } from "lucide-react"

import type { SyncStatus } from "@/lib/sync"
import { SyncIndicator } from "./SyncIndicator"

// Fraunces wordmark, sync indicator, settings gear. The sync indicator is live
// as of #19 (silent when synced, so the header is usually just wordmark + gear);
// its tap explains or re-auths, and the gear opens Settings (owned by
// MainScreen).
export function Header({
  onOpenSettings,
  syncStatus,
  onReauth,
}: {
  onOpenSettings: () => void
  syncStatus: SyncStatus
  onReauth: () => void
}) {
  return (
    <header className="flex items-center justify-between px-5 pt-7 pb-4">
      <div className="font-wordmark text-[30px] leading-none font-semibold">
        Yaffle
      </div>
      <div className="flex items-center gap-1">
        <SyncIndicator status={syncStatus} onReauth={onReauth} />
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e6dcc8] bg-card text-muted-foreground transition-colors hover:text-foreground dark:border-border"
        >
          <Settings2 className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  )
}

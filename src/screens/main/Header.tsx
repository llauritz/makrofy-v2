import { Settings2 } from "lucide-react"

import { Squircle } from "@/components/ui/squircle"
import { useI18n } from "@/lib/i18n/useI18n"
import type { SyncStatus } from "@/lib/sync"
import { AnimatedWordmark } from "./AnimatedWordmark"
import { CloudSyncButton } from "./CloudSyncButton"

// Animated wordmark (#79), the cloud sync button, settings gear. The cloud
// invites a sign-in while signed out, then stands beside the gear as a quiet
// status (CloudSyncButton); the gear opens Settings (owned by MainScreen).
export function Header({
  onOpenSettings,
  syncStatus,
}: {
  onOpenSettings: () => void
  syncStatus: SyncStatus
}) {
  const { t } = useI18n()
  return (
    <header className="flex items-center justify-between px-5 pt-7 pb-4">
      <AnimatedWordmark />
      <div className="flex items-center gap-1.5">
        <CloudSyncButton status={syncStatus} onOpenSettings={onOpenSettings} />
        <Squircle
          asChild
          pill
          outline="solid"
          outlineClassName="text-[#e6dcc8] dark:text-border"
        >
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={t.header.settings}
            className="flex h-9 w-9 items-center justify-center bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <Settings2 className="h-[18px] w-[18px]" />
          </button>
        </Squircle>
      </div>
    </header>
  )
}

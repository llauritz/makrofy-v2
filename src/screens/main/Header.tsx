import { CloudOff, Settings2 } from "lucide-react"

// Fraunces wordmark, sync indicator, settings gear. The sync indicator is a
// static placeholder until #19 feeds it real states; for now both it and the
// gear open the Settings sheet (owned and rendered by MainScreen).
export function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <header className="flex items-center justify-between px-5 pt-7 pb-4">
      <div className="font-wordmark text-[30px] leading-none font-semibold">
        Yaffle
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Sync status: not synced"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          <CloudOff className="h-[18px] w-[18px]" />
        </button>
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

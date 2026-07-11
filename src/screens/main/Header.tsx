import { CloudOff, Settings2 } from "lucide-react"

// Fraunces wordmark, sync indicator, settings. The sync indicator is a static
// placeholder until #19 feeds it real states; settings opens nothing until #17.
export function Header() {
  return (
    <header className="flex items-center justify-between px-5 pt-7 pb-4">
      <div className="font-wordmark text-[30px] leading-none font-semibold">
        Yaffle
      </div>
      <div className="flex items-center gap-1">
        <button
          aria-label="Sync status: not synced"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground"
        >
          <CloudOff className="h-[18px] w-[18px]" />
        </button>
        <button
          aria-label="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e6dcc8] bg-card text-muted-foreground dark:border-border"
        >
          <Settings2 className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  )
}

import { CloudOff } from "lucide-react"

import { SettingsSheet } from "@/screens/settings/SettingsSheet"

// Fraunces wordmark, sync indicator, settings. The sync indicator is a static
// placeholder until #19 feeds it real states; settings opens the real surface
// (#17) — goal, theme, language, and the slots that fill in as their tickets
// land (sign-in #19, install #23, export/import #24).
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
        <SettingsSheet />
      </div>
    </header>
  )
}

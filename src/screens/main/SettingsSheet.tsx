import { Settings2 } from "lucide-react"

import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetTitle,
  BottomSheetTrigger,
} from "@/components/ui/bottom-sheet"
import { InstallAppEntry } from "@/pwa/InstallApp"

// Placeholder settings surface. #17 (onboarding + settings) builds the real one
// — goal, theme, language, sign-in, export/import. For now it exists only to
// give the quiet "Install app" entry from #23 a home; swap it out wholesale.
export function SettingsSheet() {
  return (
    <BottomSheet>
      <BottomSheetTrigger
        aria-label="Settings"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e6dcc8] bg-card text-muted-foreground transition-colors hover:text-foreground dark:border-border"
      >
        <Settings2 className="h-[18px] w-[18px]" />
      </BottomSheetTrigger>
      <BottomSheetContent className="gap-1 px-4">
        <div className="flex items-center justify-between px-2 pb-2">
          <BottomSheetTitle className="text-lg font-semibold">
            Settings
          </BottomSheetTitle>
          <BottomSheetClose />
        </div>
        <InstallAppEntry />
      </BottomSheetContent>
    </BottomSheet>
  )
}

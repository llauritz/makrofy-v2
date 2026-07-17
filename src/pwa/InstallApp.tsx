import { Download, Share, SquarePlus } from "lucide-react"
import * as React from "react"

import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet"
import { useI18n } from "@/lib/i18n/useI18n"

import { useInstallPrompt } from "./useInstallPrompt"

// The quiet "Install app" entry (spec § PWA & offline): no banners, no nudges.
// It only renders where it can act — a captured native prompt on Chromium, or
// the Add-to-Home-Screen guide on iOS — and disappears once installed.
//
// Belongs in Settings; #17 builds that surface and re-homes this component.
export function InstallAppEntry() {
  const { t } = useI18n()
  const { affordance, promptInstall } = useInstallPrompt()
  const [iosGuideOpen, setIosGuideOpen] = React.useState(false)

  if (affordance === "installed" || affordance === "none") {
    return null
  }

  const onClick = () => {
    if (affordance === "prompt") {
      void promptInstall()
    } else {
      setIosGuideOpen(true)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted"
      >
        <Download className="h-[18px] w-[18px] text-muted-foreground" />
        <span className="flex-1 text-[15px] font-medium">
          {t.install.installApp}
        </span>
        <span className="text-[13px] text-muted-foreground">
          {affordance === "ios-guide" ? t.install.howTo : t.install.addToHomeScreen}
        </span>
      </button>

      <IosInstallGuide open={iosGuideOpen} onOpenChange={setIosGuideOpen} />
    </>
  )
}

// A short instruction sheet for iOS Safari, which never fires
// `beforeinstallprompt` — the user installs via the Share menu by hand.
function IosInstallGuide({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="gap-4">
        <div className="flex items-start justify-between gap-3">
          <BottomSheetTitle className="font-wordmark text-xl font-semibold">
            {t.install.iosTitle}
          </BottomSheetTitle>
          <BottomSheetClose />
        </div>

        <BottomSheetDescription className="text-[15px] text-muted-foreground">
          {t.install.iosBody}
        </BottomSheetDescription>

        <ol className="flex flex-col gap-3">
          <IosStep icon={<Share className="h-5 w-5" />} n={1}>
            {t.install.iosStep1}
          </IosStep>
          <IosStep icon={<SquarePlus className="h-5 w-5" />} n={2}>
            {t.install.iosStep2}
          </IosStep>
        </ol>
      </BottomSheetContent>
    </BottomSheet>
  )
}

function IosStep({
  icon,
  n,
  children,
}: {
  icon: React.ReactNode
  n: number
  children: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-foreground">
        {icon}
      </span>
      <span className="text-[15px]">
        <span className="text-muted-foreground">{n}. </span>
        {children}
      </span>
    </li>
  )
}

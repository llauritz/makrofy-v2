import { Check, Share, SquarePlus } from "lucide-react"
import * as React from "react"

import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet"
import { Squircle } from "@/components/ui/squircle"
import { useI18n } from "@/lib/i18n/useI18n"

import { AppIcon } from "./AppIcon"
import { useInstallPrompt } from "./useInstallPrompt"

// The quiet "Install app" entry in Settings (spec § PWA & offline). It only
// renders where it can act — a captured native prompt on Chromium, or the
// Add-to-Home-Screen guide on iOS — and disappears once installed. The main
// screen's InstallCard offers the same once, on phones.
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

  // Laid out like the main screen's install card (icon, title over a short
  // explanation, the action as an outlined pill), in the type of the other
  // Settings rows (Sign in with Google). The whole row is the
  // button, so the pill is drawn, not nested.
  return (
    <>
      <Squircle asChild radius="2xl">
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted"
        >
          <AppIcon />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">
              {t.install.cardTitle}
            </span>
            <span className="block truncate text-[13px] text-muted-foreground">
              {t.install.cardBody}
            </span>
          </span>
          <Squircle
            pill
            outline="solid"
            className="shrink-0 rounded-full px-2 py-1 text-xs font-medium"
          >
            {affordance === "ios-guide"
              ? t.install.cardShowHow
              : t.install.cardInstall}
          </Squircle>
        </button>
      </Squircle>

      <IosInstallGuide open={iosGuideOpen} onOpenChange={setIosGuideOpen} />
    </>
  )
}

// A short instruction sheet for iOS, which never fires `beforeinstallprompt`:
// the user installs via the Share menu by hand. Shared with InstallCard.
export function IosInstallGuide({
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
          <IosStep icon={<Check className="h-5 w-5" />} n={3}>
            {t.install.iosStep3}
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
      <Squircle
        radius="lg"
        className="flex h-10 w-10 shrink-0 items-center justify-center bg-secondary text-foreground"
      >
        {icon}
      </Squircle>
      <span className="text-[15px]">
        <span className="text-muted-foreground">{n}. </span>
        {children}
      </span>
    </li>
  )
}

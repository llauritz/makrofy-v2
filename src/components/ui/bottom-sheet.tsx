/* eslint-disable react-refresh/only-export-components */
import { Dialog } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import * as React from "react"

import { useI18n } from "@/lib/i18n/useI18n"
import { cn } from "@/lib/utils"

// A bottom sheet on Base UI's Dialog: a dimmed backdrop and a rounded card that
// slides up from the bottom and animates back out. Shared by the install flow
// (#23) and the placeholder settings sheet; #17's settings surface can reuse it.
export const BottomSheet = Dialog.Root
export const BottomSheetTrigger = Dialog.Trigger
export const BottomSheetTitle = Dialog.Title
export const BottomSheetDescription = Dialog.Description

export function BottomSheetContent({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <Dialog.Popup
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md flex-col rounded-t-3xl border border-b-0 border-border bg-card px-5 pt-5 pb-8 transition-transform duration-300 ease-out data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
          className
        )}
      >
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  )
}

export function BottomSheetClose() {
  const { t } = useI18n()
  return (
    <Dialog.Close
      aria-label={t.common.close}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
    >
      <X className="h-[18px] w-[18px]" />
    </Dialog.Close>
  )
}

/* eslint-disable react-refresh/only-export-components */
import { Dialog } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import * as React from "react"

import { Squircle } from "@/components/ui/squircle"
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
  // The sheet rests on the viewport's bottom edge, so only its top corners are
  // rounded, and its outline is open along the bottom.
  //
  // `className` lands on an inner body, not the popup: a tall sheet makes the
  // body its scroller (max-h + overflow-y-auto), while the outline stays on
  // the popup. The outline's ring overhangs its box by a few px on purpose
  // (squircle.tsx, Stroke); inside a scroller that overhang became scrollable
  // area — a pixel or two of sideways scroll — and the ring scrolled away
  // with the content.
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <Squircle asChild radius="3xl" corners="top" outline="solid">
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md flex-col border-b-0 bg-card transition-transform duration-300 ease-out data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full">
          <div
            className={cn(
              "flex min-h-0 flex-col overscroll-contain px-5 pt-5 pb-8",
              className
            )}
          >
            {children}
          </div>
        </Dialog.Popup>
      </Squircle>
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

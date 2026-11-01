import * as React from "react"
import { X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { Squircle } from "@/components/ui/squircle"
import { useI18n } from "@/lib/i18n/useI18n"
import { showInstallCard } from "@/pwa/install"
import {
  readInstallCardDismissed,
  writeInstallCardDismissed,
} from "@/pwa/install-dismiss"
import { IosInstallGuide } from "@/pwa/InstallApp"
import { useInstallPrompt } from "@/pwa/useInstallPrompt"
import { SPRING } from "./anim"

// Let the launch settle before the card makes space, so it arrives on its own
// rather than as part of the first paint.
const ENTRANCE_DELAY_MS = 1200

// "Add Yaffle to your home screen": a small card above the summary card,
// shown in a phone browser only (gates in pwa/install.ts). On Android the
// button opens the browser's own install dialog; iOS has no such API, so it
// opens the Share → Add to Home Screen guide instead. ✕ hides it for good on
// this device; the "Install app" row in Settings stays.
export function InstallCard() {
  const { t } = useI18n()
  const reduce = useReducedMotion()
  const { affordance, isTouch, promptInstall } = useInstallPrompt()
  const [dismissed, setDismissed] = React.useState(readInstallCardDismissed)
  const [ready, setReady] = React.useState(false)
  const [guideOpen, setGuideOpen] = React.useState(false)

  React.useEffect(() => {
    const id = setTimeout(() => setReady(true), ENTRANCE_DELAY_MS)
    return () => clearTimeout(id)
  }, [])

  const visible =
    ready && showInstallCard({ affordance, isTouch, dismissed })

  const dismiss = () => {
    writeInstallCardDismissed()
    setDismissed(true)
  }

  const onInstall = async () => {
    if (affordance === "ios-guide") {
      setGuideOpen(true)
      return
    }
    // Either answer in the browser's dialog settles it: accepted, the app is
    // installing and the card has no further use; declined, asking again
    // from the main screen would be nagging. Settings still offers it.
    const outcome = await promptInstall()
    if (outcome !== "unavailable") dismiss()
  }

  return (
    <>
      <AnimatePresence>
        {visible && (
          // Space-making entrance and exit (spec § Motion), like the morning
          // strip: the box grows and collapses for real while the content
          // fades.
          <motion.div
            key="install-card"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={reduce ? { duration: 0 } : SPRING}
            className="overflow-hidden"
          >
            {/* No shadow: the height clip above would cut it into a band, and
                the outline already sets the card off the page. */}
            <div className="mb-2">
              <Squircle
                radius="3xl"
                outline="solid"
                className="flex items-center gap-3 bg-card py-3 pr-2 pl-3"
              >
                <Squircle
                  radius={10}
                  outline="solid"
                  className="h-10 w-10 shrink-0 overflow-hidden"
                >
                  <img
                    src="/icons/apple-touch-icon.png"
                    alt=""
                    className="h-full w-full"
                    draggable={false}
                  />
                </Squircle>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] leading-tight font-semibold">
                    {t.install.cardTitle}
                  </div>
                  <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                    {t.install.cardBody}
                  </div>
                </div>
                <Squircle asChild pill outline="solid">
                  <motion.button
                    type="button"
                    onClick={() => void onInstall()}
                    whileTap={{ scale: 0.95 }}
                    className="shrink-0 rounded-full px-3 py-1 text-xs font-medium"
                  >
                    {affordance === "ios-guide"
                      ? t.install.cardShowHow
                      : t.install.cardInstall}
                  </motion.button>
                </Squircle>
                <motion.button
                  type="button"
                  aria-label={t.install.cardDismiss}
                  onClick={dismiss}
                  whileTap={{ scale: 0.9 }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </motion.button>
              </Squircle>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <IosInstallGuide open={guideOpen} onOpenChange={setGuideOpen} />
    </>
  )
}

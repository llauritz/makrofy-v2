import { AnimatePresence, motion } from "motion/react"

import { Squircle } from "@/components/ui/squircle"
import { dismissCloudPrompt, useCloudAccount } from "@/data/cloud-account"
import { startGoogleSignIn } from "@/data/identity"
import { resolveCloudButton, type CloudButton } from "@/lib/cloud-button"
import { auth } from "@/lib/firebase"
import { useI18n } from "@/lib/i18n/useI18n"
import type { SyncStatus } from "@/lib/sync"
import { useOnline } from "@/lib/useOnline"
import { FADE_IN, FADE_OUT, SPRING } from "./anim"
import { CloudOffGlyph } from "./CloudOffGlyph"

// The header's cloud (replaces the #19 sync indicator). Signed out, it is a
// faint outlined text button with the off cloud on its right ("Sync data",
// "Log in again"), whose tap goes straight to Google; once that is turned
// down, the cloud alone, bare on the background, whose tap opens Settings.
// Signed in, the header is clear unless the device is offline. Moving between
// these is space-and-fade (ADR 0007): the text fades, then the pill springs its
// real width down to the cloud's tap target, the cloud pinned to the right the
// whole way, while the outline fades out; appearing and leaving, the whole
// button fades and makes or gives back its space. lib/cloud-button.ts decides
// which applies.

/** The cloud's tap target, the gear's size. */
const ICON = 36

export function CloudSyncButton({
  status,
  onOpenSettings,
}: {
  status: SyncStatus
  onOpenSettings: () => void
}) {
  const { t } = useI18n()
  const online = useOnline()
  const { account, dismissed } = useCloudAccount()
  const button = resolveCloudButton({
    account,
    dismissed,
    sync: status,
    online,
  })
  const prompt = button.kind === "prompt"

  const label =
    button.kind === "prompt"
      ? t.cloud[button.label]
      : button.kind === "icon" && button.reason === "offline"
        ? t.cloud.offlineAria
        : t.cloud.offAria

  const onClick = () => {
    if (!prompt) return onOpenSettings()
    // Remembered first: the redirect may come back without a sign-in, and
    // then the cloud should stand alone.
    dismissCloudPrompt()
    void startGoogleSignIn(auth)
  }

  return (
    <AnimatePresence initial={false}>
      {button.kind !== "hidden" && (
        <CloudPill
          key="cloud"
          button={button}
          label={label}
          onClick={onClick}
        />
      )}
    </AnimatePresence>
  )
}

/** The pill itself, state in, tap out — what the header and previews draw. */
export function CloudPill({
  button,
  label,
  onClick,
}: {
  button: Exclude<CloudButton, { kind: "hidden" }>
  label: string
  onClick: () => void
}) {
  const prompt = button.kind === "prompt"
  return (
    <Squircle
      asChild
      pill
      outline="solid"
      outlineClassName={
        "transition-colors duration-300 " +
        (prompt ? "text-border" : "text-transparent")
      }
    >
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={prompt ? undefined : label}
        initial={{ opacity: 0, width: 0 }}
        animate={{ opacity: 1, width: prompt ? "auto" : ICON }}
        exit={{
          opacity: 0,
          width: 0,
          transition: { opacity: FADE_OUT, width: { ...SPRING, delay: 0.06 } },
        }}
        transition={{
          width: prompt ? SPRING : { ...SPRING, delay: 0.06 },
          opacity: FADE_IN,
        }}
        className={
          "flex h-9 shrink-0 items-center justify-end text-muted-foreground transition-colors duration-300 " +
          (prompt ? "hover:bg-muted/60" : "hover:text-foreground")
        }
      >
        <AnimatePresence initial={false}>
          {prompt && (
            <motion.span
              key="label"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { ...FADE_IN, delay: 0.1 } }}
              exit={{ opacity: 0, transition: FADE_OUT }}
              className={
                "pl-3.5 text-[13px] font-medium whitespace-nowrap " +
                (button.label === "loginAgain"
                  ? "text-foreground"
                  : "text-muted-foreground")
              }
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center">
          <CloudOffGlyph className="h-[18px] w-[18px]" />
        </span>
      </motion.button>
    </Squircle>
  )
}

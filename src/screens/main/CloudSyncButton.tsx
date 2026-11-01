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
import { CloudGlyph } from "./CloudGlyph"

// The header's cloud (replaces the #19 sync indicator). One squircle pill that
// is either a faint outlined text button with the cloud on its right ("Sync
// data", "Log in again"), whose tap goes straight to Google, or the cloud
// alone, matching the gear beside it, whose tap opens Settings. Moving between
// the two is space-and-fade (ADR 0007): the text fades, then the pill springs
// its real width down to the cloud's circle, the cloud pinned to the right the
// whole way, while the outline firms up and the card fill comes in.
// lib/cloud-button.ts decides which applies.

/** The cloud's circle, the gear's size. */
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

  const label = prompt
    ? t.cloud[button.label]
    : account !== "google"
      ? t.cloud.offAria
      : button.glyph === "cloud"
        ? t.cloud.syncedAria
        : button.glyph === "uploading"
          ? t.cloud.uploadingAria
          : t.cloud.offlineAria

  const onClick = () => {
    if (!prompt) return onOpenSettings()
    // Remembered first: the redirect may come back without a sign-in, and
    // then the cloud should stand alone.
    dismissCloudPrompt()
    void startGoogleSignIn(auth)
  }

  return <CloudPill button={button} label={label} onClick={onClick} />
}

/** The pill itself, state in, tap out — what the header and previews draw. */
export function CloudPill({
  button,
  label,
  onClick,
}: {
  button: CloudButton
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
        prompt
          ? "text-border transition-colors duration-300"
          : "text-[#e6dcc8] transition-colors duration-300 dark:text-border"
      }
    >
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={prompt ? undefined : label}
        initial={false}
        animate={{ width: prompt ? "auto" : ICON }}
        transition={prompt ? SPRING : { ...SPRING, delay: 0.06 }}
        className={
          "flex h-9 shrink-0 items-center justify-end transition-colors duration-300 " +
          (prompt
            ? "bg-transparent text-muted-foreground hover:bg-muted/60"
            : "bg-card text-muted-foreground hover:text-foreground")
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
          <CloudGlyph glyph={button.glyph} className="h-[18px] w-[18px]" />
        </span>
      </motion.button>
    </Squircle>
  )
}

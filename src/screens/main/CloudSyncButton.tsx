import { AnimatePresence, motion } from "motion/react"

import { Squircle } from "@/components/ui/squircle"
import { useCloudAccount } from "@/data/cloud-account"
import { resolveCloudButton, type CloudButton } from "@/lib/cloud-button"
import { useI18n } from "@/lib/i18n/useI18n"
import type { SyncStatus } from "@/lib/sync"
import { useOnline } from "@/lib/useOnline"
import { FADE_IN, FADE_OUT, SPRING } from "./anim"
import { CloudOffGlyph } from "./CloudOffGlyph"

// The header's cloud (replaces the #19 sync indicator). Signed out, it is a
// faint outlined text button, words only ("Sync data", "Log in again"), whose
// tap opens Settings with the sign-in row blinking; opening Settings turns the
// invitation down, so from then on it is the off cloud alone, bare on the
// background, whose tap opens Settings plainly. Signed in, the header is clear
// unless the device is offline. Moving between these is space-and-fade (ADR
// 0007): the text fades out as the pill springs its real width down to the
// cloud's tap target, the cloud fading in on the right, while the outline
// fades out; appearing and leaving, the whole button fades and makes or gives
// back its space. lib/cloud-button.ts decides which applies.

/** The cloud's tap target, the gear's size. */
const ICON = 36

export function CloudSyncButton({
  status,
  onOpenSettings,
  onOpenSignIn,
}: {
  status: SyncStatus
  onOpenSettings: () => void
  /** Settings, opened onto the sign-in row (which blinks). */
  onOpenSignIn: () => void
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

  // Opening Settings is what turns the invitation down (SettingsSheet), so
  // the pill is already becoming the bare cloud behind the sheet.
  const onClick = prompt ? onOpenSignIn : onOpenSettings

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
        // The outline is drawn in the label's own colour, so the pill reads
        // as one button rather than faint text in a fainter frame.
        (!prompt
          ? "text-transparent"
          : button.label === "loginAgain"
            ? "text-foreground"
            : "text-muted-foreground")
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
                "px-3.5 text-[13px] font-medium whitespace-nowrap " +
                (button.label === "loginAgain"
                  ? "text-foreground"
                  : "text-muted-foreground")
              }
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {!prompt && (
            <motion.span
              key="cloud"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { ...FADE_IN, delay: 0.1 } }}
              exit={{ opacity: 0, transition: FADE_OUT }}
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center"
            >
              <CloudOffGlyph className="h-[18px] w-[18px]" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </Squircle>
  )
}

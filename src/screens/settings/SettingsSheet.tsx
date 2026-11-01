import { BookText, ChevronRight } from "lucide-react"
import * as React from "react"

import { useLanguage } from "@/components/language-provider"
import { useTheme } from "@/components/theme-provider"
import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet"
import { Segmented } from "@/components/ui/segmented"
import { Squircle } from "@/components/ui/squircle"
import { dismissCloudPrompt } from "@/data/cloud-account"
import { DEFAULT_GOAL_KCAL, setGoal } from "@/data/goal"
import { useGoal, useIdentity } from "@/data/hooks"
import { db } from "@/lib/firebase"
import { parseGoalKcal } from "@/lib/goal-input"
import { useI18n } from "@/lib/i18n/useI18n"
import type { Language } from "@/lib/language"
import { InstallAppEntry } from "@/pwa/InstallApp"
import { ExportImport } from "@/screens/settings/ExportImport"
import { PlanSetting } from "@/screens/settings/PlanSetting"
import { SignInSetting } from "@/screens/settings/SignInSetting"

/** A Settings row another surface can open the sheet onto, blinking. */
export type SettingsHighlight = "signIn" | null

// The real settings surface (#17): goal · glossary · theme · language, then the
// slots that fill in as their tickets land — sign-in (#19), install (#23, live
// now) and export/import (#24). Self-contained like a screen: it reads and writes the
// synced Goal and the device-local theme/language directly. Controlled by its
// owner (MainScreen) so several affordances can open it — the header gear, the
// header cloud, and the summary ring. The goal is the one synced
// setting (ADR 0003); theme and language stay on the device.
export function SettingsSheet({
  open,
  onOpenChange,
  onOpenGlossary,
  highlight = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenGlossary: () => void
  /** A row to blink on the way in, for whatever sent the user here. */
  highlight?: SettingsHighlight
}) {
  const { t } = useI18n()
  // Opening Settings without signing in turns the header's sign-in invitation
  // down: the cloud stands alone from then on (CloudSyncButton).
  React.useEffect(() => {
    if (open) dismissCloudPrompt()
  }, [open])
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="max-h-[88svh] gap-6 overflow-y-auto">
        <div className="flex items-center justify-between">
          <BottomSheetTitle className="text-lg font-semibold">
            {t.settings.title}
          </BottomSheetTitle>
          <BottomSheetClose />
        </div>

        <GoalSetting />
        {/* The Glossary is the app's second surface, not a footer link — it sits
            right under the goal, above the device-local theme/language prefs. */}
        <NavRow
          icon={<BookText className="h-[18px] w-[18px]" />}
          label={t.settings.foodGlossary}
          onClick={onOpenGlossary}
        />
        <ThemeSetting />
        <LanguageSetting />

        <div className="flex flex-col gap-1 border-t pt-4">
          <PlanSetting onOpen={() => onOpenChange(false)} />
          <SignInSetting highlight={open && highlight === "signIn"} />
          <InstallAppEntry />
          <ExportImport />
        </div>

        <LegalLinks />
      </BottomSheetContent>
    </BottomSheet>
  )
}

// The legal pages are static documents outside the app (public/*.html), so
// Paddle's domain review and signed-out visitors can reach them. They open in
// a new tab so an installed PWA keeps its own window.
function LegalLinks() {
  const { t } = useI18n()
  const links = [
    { href: "/terms", label: t.settings.terms },
    { href: "/privacy", label: t.settings.privacy },
    { href: "/refunds", label: t.settings.refunds },
  ]
  return (
    <nav
      aria-label={t.settings.legalLinks}
      className="flex justify-center gap-4 text-xs text-muted-foreground"
    >
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener"
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          {link.label}
        </a>
      ))}
    </nav>
  )
}

// A settings row that navigates elsewhere in the app — a live feature, unlike
// StubRow. Tapping runs onClick (the owner closes the sheet and switches view).
function NavRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Squircle asChild radius="2xl">
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1 text-[15px] font-medium">{label}</span>
        <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" />
      </button>
    </Squircle>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {label}
      </label>
      {children}
    </div>
  )
}

// The daily calorie goal — the one synced setting, so an edit here shows up on
// every device (ADR 0003). The editor is keyed on the synced kcal so a change
// from another device re-seeds the field by remounting it, no prop-syncing
// effect. Edits commit on blur or Enter; a blank or invalid figure reverts to
// the last good value rather than writing a broken Goal.
function GoalSetting() {
  const { t } = useI18n()
  const uid = useIdentity()
  const goal = useGoal(uid)
  const kcal = goal?.kcal ?? DEFAULT_GOAL_KCAL

  return (
    <Field label={t.settings.dailyGoal} htmlFor="settings-goal">
      <GoalInput
        key={kcal}
        kcal={kcal}
        disabled={!uid}
        onCommit={(next) => uid && setGoal(db, uid, { ...goal, kcal: next })}
      />
    </Field>
  )
}

function GoalInput({
  kcal,
  disabled,
  onCommit,
}: {
  kcal: number
  disabled: boolean
  onCommit: (kcal: number) => void
}) {
  const { t } = useI18n()
  const [value, setValue] = React.useState(String(kcal))

  const commit = () => {
    const parsed = parseGoalKcal(value)
    if (parsed === null) {
      setValue(String(kcal)) // revert to the last good value
      return
    }
    setValue(String(parsed))
    if (parsed !== kcal) onCommit(parsed)
  }

  return (
    <Squircle
      radius="2xl"
      className="flex items-baseline gap-2 bg-input px-4 py-3"
    >
      <input
        id="settings-goal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
        }}
        onFocus={(e) => e.target.select()}
        inputMode="numeric"
        autoComplete="off"
        aria-label={t.settings.dailyGoalAria}
        disabled={disabled}
        className="min-w-0 flex-1 bg-transparent text-lg font-bold tabular-nums outline-none"
      />
      <span className="text-sm font-medium text-muted-foreground">
        {t.units.kcal}
      </span>
    </Squircle>
  )
}

function ThemeSetting() {
  const { t } = useI18n()
  const { theme, setTheme } = useTheme()
  return (
    <Field label={t.settings.theme}>
      <Segmented
        ariaLabel={t.settings.theme}
        value={theme}
        onChange={setTheme}
        options={[
          { value: "system", label: t.settings.themeSystem },
          { value: "light", label: t.settings.themeLight },
          { value: "dark", label: t.settings.themeDark },
        ]}
      />
    </Field>
  )
}

function LanguageSetting() {
  const { t } = useI18n()
  const { language, setLanguage } = useLanguage()
  return (
    <Field label={t.settings.language}>
      <Segmented<Language>
        ariaLabel={t.settings.language}
        value={language}
        onChange={setLanguage}
        options={[
          { value: "en", label: t.settings.languageEnglish },
          { value: "es", label: t.settings.languageSpanish },
        ]}
      />
    </Field>
  )
}

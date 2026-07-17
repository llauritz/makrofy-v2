import { ArrowLeftRight, BookText, ChevronRight } from "lucide-react"
import * as React from "react"

import { useLanguage } from "@/components/language-provider"
import { useTheme } from "@/components/theme-provider"
import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet"
import { DEFAULT_GOAL_KCAL, setGoal } from "@/data/goal"
import { useGoal, useIdentity } from "@/data/hooks"
import { db } from "@/lib/firebase"
import { parseGoalKcal } from "@/lib/goal-input"
import { useI18n } from "@/lib/i18n/useI18n"
import type { Language } from "@/lib/language"
import { cn } from "@/lib/utils"
import { InstallAppEntry } from "@/pwa/InstallApp"
import { SignInSetting } from "@/screens/settings/SignInSetting"

// The real settings surface (#17): goal · glossary · theme · language, then the
// slots that fill in as their tickets land — sign-in (#19), install (#23, live
// now) and export/import (#24). Self-contained like a screen: it reads and writes the
// synced Goal and the device-local theme/language directly. Controlled by its
// owner (MainScreen) so several affordances can open it — the header gear, the
// header sync indicator, and the summary ring. The goal is the one synced
// setting (ADR 0003); theme and language stay on the device.
export function SettingsSheet({
  open,
  onOpenChange,
  onOpenGlossary,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenGlossary: () => void
}) {
  const { t } = useI18n()
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
          <SignInSetting />
          <InstallAppEntry />
          <StubRow
            icon={<ArrowLeftRight className="h-[18px] w-[18px]" />}
            label={t.settings.exportImport}
          />
        </div>
      </BottomSheetContent>
    </BottomSheet>
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
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 text-[15px] font-medium">{label}</span>
      <ChevronRight className="h-[18px] w-[18px] text-muted-foreground" />
    </button>
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
    <div className="flex items-baseline gap-2 rounded-2xl bg-input px-4 py-3">
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
    </div>
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

// A pill segmented control (radiogroup). The active segment is marked by fill,
// not motion — nothing moves, so there is no layout jump between choices.
function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
  ariaLabel: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex gap-1 rounded-full bg-input p-1"
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-[0_1px_2px_rgba(43,32,21,0.12)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

// A settings slot whose feature hasn't shipped yet — visible so the surface
// reads as complete, inert until its ticket lands (sign-in #19, export #24).
function StubRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  const { t } = useI18n()
  return (
    <div
      aria-disabled="true"
      className="flex items-center gap-3 rounded-2xl px-4 py-3 opacity-45"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 text-[15px] font-medium">{label}</span>
      <span className="text-[13px] text-muted-foreground">{t.common.soon}</span>
    </div>
  )
}

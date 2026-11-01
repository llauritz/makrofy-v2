import { Switch } from "@base-ui/react/switch"
import { Plus, X } from "lucide-react"
import * as React from "react"

import { Squircle } from "@/components/ui/squircle"
import { useReminderSettings } from "@/data/reminder-settings"
import { useI18n } from "@/lib/i18n/useI18n"
import {
  DEFAULT_REMINDER_TIMES,
  isReminderTime,
  MAX_REMINDERS,
  nextReminderTime,
  normalizeTimes,
} from "@/lib/reminders"
import {
  checkReminderPermission,
  remindersAvailable,
  requestReminderPermission,
} from "@/native/reminders"

// Optional reminders to log (ADR 0013) — Android only, device-local, off by
// default. A master switch, then the day's reminder times (add, edit, remove)
// and the smart skip. The notification permission is asked for only when the
// switch goes on; a refusal keeps it off and says plainly how to allow it.
export function RemindersSetting() {
  if (!remindersAvailable()) return null
  return <RemindersSection />
}

export function RemindersSection() {
  const { t, n } = useI18n()
  const [settings, setSettings] = useReminderSettings()
  const [denied, setDenied] = React.useState(false)
  const [asking, setAsking] = React.useState(false)

  // Permission can be withdrawn from system settings while reminders are on;
  // say so here rather than silently scheduling nothing.
  React.useEffect(() => {
    if (!settings.enabled) return
    let live = true
    checkReminderPermission()
      .then((p) => {
        if (live) setDenied(p === "denied")
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [settings.enabled])

  const toggle = async (on: boolean) => {
    if (!on) {
      setDenied(false)
      setSettings({ ...settings, enabled: false })
      return
    }
    setAsking(true)
    try {
      const permission = await requestReminderPermission().catch(
        () => "denied" as const,
      )
      if (permission !== "granted") {
        setDenied(true)
        return
      }
      setDenied(false)
      setSettings({
        ...settings,
        enabled: true,
        times: settings.times.length
          ? settings.times
          : [...DEFAULT_REMINDER_TIMES],
      })
    } finally {
      setAsking(false)
    }
  }

  const setTimes = (times: string[]) =>
    setSettings({ ...settings, times: normalizeTimes(times) })
  const next = nextReminderTime(settings.times)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t.reminders.title}
      </span>
      <SwitchRow
        label={t.reminders.toggle}
        hint={t.reminders.toggleHint}
        checked={settings.enabled}
        disabled={asking}
        onChange={(on) => void toggle(on)}
      />
      {denied && (
        <p role="status" className="px-4 text-[13px] text-muted-foreground">
          {t.reminders.denied}
        </p>
      )}
      {settings.enabled && (
        <>
          <ul className="flex flex-col gap-2">
            {settings.times.map((time, i) => (
              <li key={time}>
                <Squircle
                  radius="2xl"
                  className="flex items-center gap-2 bg-input py-1.5 pr-1.5 pl-4"
                >
                  <input
                    type="time"
                    value={time}
                    aria-label={t.reminders.timeAria(n(i + 1))}
                    onChange={(e) => {
                      const value = e.target.value
                      if (!isReminderTime(value)) return
                      setTimes(settings.times.map((x) => (x === time ? value : x)))
                    }}
                    className="min-w-0 flex-1 bg-transparent py-1.5 text-lg font-bold tabular-nums outline-none [&::-webkit-calendar-picker-indicator]:hidden"
                  />
                  <button
                    type="button"
                    aria-label={t.reminders.remove}
                    onClick={() => setTimes(settings.times.filter((x) => x !== time))}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-[18px] w-[18px]" />
                  </button>
                </Squircle>
              </li>
            ))}
          </ul>
          {next && settings.times.length < MAX_REMINDERS && (
            <Squircle asChild radius="2xl">
              <button
                type="button"
                onClick={() => setTimes([...settings.times, next])}
                className="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
              >
                <Plus className="h-[18px] w-[18px] text-muted-foreground" />
                <span className="flex-1 text-[15px] font-medium">
                  {t.reminders.add}
                </span>
              </button>
            </Squircle>
          )}
          <SwitchRow
            label={t.reminders.smartSkip}
            hint={t.reminders.smartSkipHint}
            checked={settings.smartSkip}
            onChange={(on) => setSettings({ ...settings, smartSkip: on })}
          />
        </>
      )}
    </div>
  )
}

// A settings row with a switch on the right; the whole row is the label, so a
// tap anywhere toggles. The active state is ink fill, like the segmented
// control's; the thumb slides, and snaps under reduced motion.
function SwitchRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const id = React.useId()
  return (
    <Squircle asChild radius="2xl">
      <label
        htmlFor={id}
        className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">{label}</span>
          {hint && (
            <span className="block text-[13px] text-muted-foreground">
              {hint}
            </span>
          )}
        </span>
        <Switch.Root
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => onChange(next)}
          className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-[color-mix(in_oklch,var(--muted-foreground),transparent_55%)] p-0.5 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[checked]:bg-primary data-[disabled]:opacity-50 motion-reduce:transition-none"
        >
          <Switch.Thumb className="block h-6 w-6 rounded-full bg-card shadow-[0_1px_2px_rgba(43,32,21,0.2)] transition-transform data-[checked]:translate-x-5 motion-reduce:transition-none" />
        </Switch.Root>
      </label>
    </Squircle>
  )
}

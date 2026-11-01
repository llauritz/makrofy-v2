import * as React from "react"

import { useReminderSettings } from "@/data/reminder-settings"
import { useDay } from "@/data/hooks"
import { localDay } from "@/lib/day"
import type { Dictionary } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/useI18n"
import { planReminders, planSignature } from "@/lib/reminders"
import {
  applyReminderPlan,
  onReminderTap,
  remindersAvailable,
  type ReminderCopy,
} from "@/native/reminders"

// The app-level half of reminders (ADR 0013). Mounted once in App: it keeps the
// OS's rolling window of reminders in step with the settings and today's
// Entries, and routes a tapped reminder to the add card. On web both hooks are
// inert — no listener, no schedule.

/** Wait this long after the last change before touching the OS. */
const SYNC_DEBOUNCE_MS = 1000

/** Today's Day string, kept current across midnight and app resumes. */
function useToday(): string {
  const [today, setToday] = React.useState(() => localDay(new Date()))
  React.useEffect(() => {
    const refresh = () => setToday(localDay(new Date()))
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 1000)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [today])
  return today
}

function reminderCopy(t: Dictionary): ReminderCopy {
  return {
    channelName: t.reminders.channelName,
    channelDescription: t.reminders.channelDescription,
    title: (meal) => t.reminders.notificationTitle[meal],
    body: t.reminders.notificationBody,
  }
}

/**
 * Re-plan and re-apply the reminder window whenever the settings, the language
 * or today's Entries change, and on every return to the app. Runs after first
 * paint and never blocks it: the work is debounced and fire-and-forget.
 */
export function useReminderSync(uid: string | null): void {
  const available = remindersAvailable()
  const [settings] = useReminderSettings()
  const { t, language } = useI18n()
  const today = useToday()
  // Only listen to today's Entries when there is something to skip.
  const watchEntries = available && settings.enabled && settings.smartSkip
  const todayEntries = useDay(watchEntries ? uid : null, today)
  const loggedAt = React.useMemo(
    () => todayEntries.map((e) => e.createdAt.toMillis()),
    [todayEntries],
  )

  const lastSignature = React.useRef<string | null>(null)
  const queue = React.useRef<Promise<void>>(Promise.resolve())

  React.useEffect(() => {
    if (!available) return
    const timer = setTimeout(() => {
      const plan = planReminders(settings, new Date(), loggedAt)
      const signature = planSignature(plan, language)
      if (signature === lastSignature.current) return
      lastSignature.current = signature
      // Serialize applies so a slow cancel never interleaves with the next one.
      queue.current = queue.current
        .then(() => applyReminderPlan(plan, reminderCopy(t)))
        .catch((err) => {
          lastSignature.current = null // retry on the next change
          console.warn("Reminder schedule failed", err)
        })
    }, SYNC_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [available, settings, loggedAt, language, t, today])
}

// A tapped reminder has two jobs on two screens: App switches to Main, and Main
// jumps to today and focuses the add card. Main may not be mounted when the
// tap arrives (Stats or the Glossary was up), so the tap waits here as pending
// until a Main subscribes, and is delivered exactly once.
let pendingTap = false
const tapSubscribers = new Set<() => void>()
function flushTap() {
  if (!pendingTap || tapSubscribers.size === 0) return
  pendingTap = false
  tapSubscribers.forEach((deliver) => deliver())
}

/** App-level: listen for reminder taps and run `onTap` (switch screens). */
export function useReminderTap(onTap: () => void): void {
  const latest = React.useRef(onTap)
  React.useEffect(() => {
    latest.current = onTap
  })
  React.useEffect(
    () =>
      onReminderTap(() => {
        pendingTap = true
        latest.current()
        flushTap()
      }),
    [],
  )
}

/** Main-level: run `onAdd` for a tapped reminder, now or once mounted. */
export function useReminderAddRequest(onAdd: () => void): void {
  const latest = React.useRef(onAdd)
  React.useEffect(() => {
    latest.current = onAdd
  })
  React.useEffect(() => {
    const deliver = () => latest.current()
    tapSubscribers.add(deliver)
    flushTap()
    return () => {
      tapSubscribers.delete(deliver)
    }
  }, [])
}

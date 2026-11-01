// Reminders (Android only, ADR 0013): the pure half — the device-local settings
// shape and the schedule they turn into. Nothing here touches Capacitor; the
// native wrapper (src/native/reminders.ts) only receives the plan this module
// computes, so every rule (which times, which Days, the smart skip) is testable
// in plain Node.
//
// The schedule is a rolling window of one-shot notifications rather than one
// repeating alarm per time: a repeating alarm can't skip a single day, and the
// smart skip needs to drop today's occurrence once the user has logged. Every
// time the app runs (launch, resume, today's Entries change) it recomputes the
// window and replaces what the OS holds.

import { deriveMealType, type MealType } from "@/data/entries"

/** A reminder time of day, 'HH:MM' on the 24-hour clock, device-local. */
export type ReminderTime = string

export interface ReminderSettings {
  /** The master toggle. Off by default; nothing is scheduled while off. */
  enabled: boolean
  /** Daily times, kept sorted and unique. Survive the toggle going off. */
  times: ReminderTime[]
  /** Skip a reminder when an Entry was already logged in its window today. */
  smartSkip: boolean
}

/** What a first switch-on seeds: one reminder per main meal. */
export const DEFAULT_REMINDER_TIMES: readonly ReminderTime[] = [
  "08:30",
  "13:00",
  "19:30",
]

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  times: [...DEFAULT_REMINDER_TIMES],
  smartSkip: true,
}

/** More than this many a day stops being a reminder and becomes noise. */
export const MAX_REMINDERS = 6

/**
 * How many Days ahead the window reaches. Reminders keep firing this long
 * without the app being opened; each launch pushes the window forward.
 */
export const REMINDER_HORIZON_DAYS = 14

/**
 * Notification ids reserved for reminders. The wrapper cancels exactly this
 * range before scheduling a new window, so other notifications (none today)
 * are never touched. MAX_REMINDERS × REMINDER_HORIZON_DAYS must fit.
 */
export const REMINDER_ID_BASE = 41_000
export const REMINDER_ID_SPAN = 1_000

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isReminderTime(value: unknown): value is ReminderTime {
  return typeof value === "string" && TIME_RE.test(value)
}

/** Minutes after midnight for a valid 'HH:MM'. */
export function minutesOf(time: ReminderTime): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

/** Sorted, de-duplicated, valid only, capped at MAX_REMINDERS. */
export function normalizeTimes(times: readonly unknown[]): ReminderTime[] {
  const valid = [...new Set(times.filter(isReminderTime))]
  valid.sort((a, b) => minutesOf(a) - minutesOf(b))
  return valid.slice(0, MAX_REMINDERS)
}

/**
 * Read stored settings defensively: anything unparseable or missing falls back
 * to the default for that field, so a corrupt value can never switch reminders
 * on. Times stay as stored (even empty) once a valid list exists.
 */
export function parseReminderSettings(raw: string | null): ReminderSettings {
  if (raw === null) return { ...DEFAULT_REMINDER_SETTINGS, times: [...DEFAULT_REMINDER_TIMES] }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_REMINDER_SETTINGS, times: [...DEFAULT_REMINDER_TIMES] }
  }
  const obj = (typeof value === "object" && value !== null ? value : {}) as Record<
    string,
    unknown
  >
  return {
    enabled: obj.enabled === true,
    times: Array.isArray(obj.times)
      ? normalizeTimes(obj.times)
      : [...DEFAULT_REMINDER_TIMES],
    smartSkip: obj.smartSkip !== false,
  }
}

export function serializeReminderSettings(settings: ReminderSettings): string {
  return JSON.stringify({
    enabled: settings.enabled,
    times: normalizeTimes(settings.times),
    smartSkip: settings.smartSkip,
  })
}

/**
 * A sensible next time for "Add reminder": an hour after the latest one,
 * stepping on (and wrapping past midnight) until it lands on a free slot.
 * Null once the list is full.
 */
export function nextReminderTime(times: readonly ReminderTime[]): ReminderTime | null {
  if (times.length >= MAX_REMINDERS) return null
  const taken = new Set(times)
  const last = times.length ? minutesOf(times[times.length - 1]) : 12 * 60 - 60
  for (let step = 1; step <= 24; step++) {
    const minutes = (last + step * 60) % (24 * 60)
    const candidate = formatTime(minutes)
    if (!taken.has(candidate)) return candidate
  }
  return null
}

function formatTime(minutes: number): ReminderTime {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

/** The meal a reminder time speaks for — the same clock windows Entries use. */
export function reminderMeal(time: ReminderTime): MealType {
  const minutes = minutesOf(time)
  return deriveMealType(new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60))
}

/** One notification the OS should hold. */
export interface PlannedReminder {
  id: number
  at: Date
  meal: MealType
}

/**
 * The window of one-shot reminders from `now` forward.
 *
 * Smart skip covers today only, because today's Entries are the only ones the
 * app knows about when it plans: a reminder is dropped when an Entry for today
 * was created inside its window — after the previous reminder of the day (or
 * since midnight, for the first) and before the reminder itself. "Have you
 * logged since I last asked?" Future Days are scheduled in full; the next
 * launch on that Day re-plans and applies the skip then.
 *
 * `todayLoggedAtMs` are the createdAt millis of today's Entries.
 */
export function planReminders(
  settings: ReminderSettings,
  now: Date,
  todayLoggedAtMs: readonly number[],
  horizonDays: number = REMINDER_HORIZON_DAYS,
): PlannedReminder[] {
  if (!settings.enabled) return []
  const times = normalizeTimes(settings.times)
  const plan: PlannedReminder[] = []

  for (let day = 0; day < horizonDays; day++) {
    times.forEach((time, slot) => {
      const minutes = minutesOf(time)
      const at = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + day,
        Math.floor(minutes / 60),
        minutes % 60,
      )
      if (at.getTime() <= now.getTime()) return

      if (day === 0 && settings.smartSkip) {
        const prev = slot > 0 ? minutesOf(times[slot - 1]) : 0
        const from = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          Math.floor(prev / 60),
          prev % 60,
        ).getTime()
        const loggedInWindow = todayLoggedAtMs.some(
          (ms) => ms >= from && ms < at.getTime(),
        )
        if (loggedInWindow) return
      }

      plan.push({
        id: REMINDER_ID_BASE + day * MAX_REMINDERS + slot,
        at,
        meal: reminderMeal(time),
      })
    })
  }
  return plan
}

/**
 * A stable fingerprint of a plan plus its copy, so the sync can skip touching
 * the OS when nothing would change (it re-plans on every Entry change).
 */
export function planSignature(plan: readonly PlannedReminder[], copyKey: string): string {
  return `${copyKey}|${plan.map((r) => `${r.id}@${r.at.getTime()}`).join(",")}`
}

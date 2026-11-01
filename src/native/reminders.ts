// The reminders bridge (ADR 0013): the only file that talks to
// @capacitor/local-notifications. On web every call is a no-op and
// `remindersAvailable()` is false, so screens never check the platform
// themselves — they ask this module.
//
// The plugin is imported lazily, so the web bundle's first paint never waits on
// it and nothing native runs before the app has rendered (plan § instant launch).

import { Capacitor, type PluginListenerHandle } from "@capacitor/core"
import type { LocalNotificationsPlugin } from "@capacitor/local-notifications"

import type { MealType } from "@/data/entries"
import {
  REMINDER_ID_BASE,
  REMINDER_ID_SPAN,
  type PlannedReminder,
} from "@/lib/reminders"

/** Android notification channel the reminders post on. */
const CHANNEL_ID = "reminders"
/** Marks our notifications in `extra`, so a tap is recognised as a reminder. */
const KIND = "yaffle-reminder"

export function remindersAvailable(): boolean {
  return Capacitor.getPlatform() === "android"
}

let plugin: Promise<LocalNotificationsPlugin> | null = null
function notifications(): Promise<LocalNotificationsPlugin> {
  plugin ??= import("@capacitor/local-notifications").then(
    (m) => m.LocalNotifications,
  )
  return plugin
}

export type ReminderPermission = "granted" | "denied" | "prompt"

function toPermission(state: string): ReminderPermission {
  if (state === "granted") return "granted"
  if (state === "denied") return "denied"
  return "prompt"
}

/** Current notification permission, without prompting. */
export async function checkReminderPermission(): Promise<ReminderPermission> {
  if (!remindersAvailable()) return "denied"
  const { display } = await (await notifications()).checkPermissions()
  return toPermission(display)
}

/**
 * Ask for the Android 13+ notification permission. Called only from the
 * settings toggle, so the system dialog appears in answer to the user turning
 * reminders on — never at launch. Older Android grants it without a dialog.
 */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (!remindersAvailable()) return "denied"
  const { display } = await (await notifications()).requestPermissions()
  return toPermission(display)
}

/** The localized words a reminder carries, per meal. */
export interface ReminderCopy {
  channelName: string
  channelDescription: string
  title: (meal: MealType) => string
  body: string
}

/**
 * Replace every scheduled reminder with `plan`. Cancels the whole reserved id
 * range first, so a removed time or a skipped occurrence disappears too. An
 * empty plan just cancels.
 */
export async function applyReminderPlan(
  plan: readonly PlannedReminder[],
  copy: ReminderCopy,
): Promise<void> {
  if (!remindersAvailable()) return
  const ln = await notifications()

  const { notifications: pending } = await ln.getPending()
  const ours = pending.filter(
    (n) => n.id >= REMINDER_ID_BASE && n.id < REMINDER_ID_BASE + REMINDER_ID_SPAN,
  )
  if (ours.length) await ln.cancel({ notifications: ours.map((n) => ({ id: n.id })) })
  if (!plan.length) return

  // Re-creating a channel is a no-op apart from refreshing its name, which
  // keeps the system settings entry in the app's current language.
  await ln.createChannel({
    id: CHANNEL_ID,
    name: copy.channelName,
    description: copy.channelDescription,
    importance: 3,
  })

  await ln.schedule({
    notifications: plan.map((r) => ({
      id: r.id,
      title: copy.title(r.meal),
      body: copy.body,
      channelId: CHANNEL_ID,
      autoCancel: true,
      extra: { kind: KIND },
      // Inexact on purpose: a few minutes' drift is fine for "log your lunch",
      // and exact alarms would send the user to the "Alarms & reminders"
      // settings screen (and need a permission Play restricts). allowWhileIdle
      // still lets it through Doze.
      isExactNotification: false,
      schedule: { at: r.at, allowWhileIdle: true },
    })),
  })
}

/**
 * Run `onTap` when the user taps a reminder — including the tap that cold-
 * started the app (the plugin holds that event until a listener attaches).
 * Returns an unsubscribe.
 */
export function onReminderTap(onTap: () => void): () => void {
  if (!remindersAvailable()) return () => {}
  let handle: PluginListenerHandle | undefined
  let cancelled = false
  void notifications()
    .then((ln) =>
      ln.addListener("localNotificationActionPerformed", (action) => {
        if (action.notification.extra?.kind === KIND) onTap()
      }),
    )
    .then((h) => {
      if (cancelled) void h.remove()
      else handle = h
    })
  return () => {
    cancelled = true
    void handle?.remove()
  }
}

// Reminder settings live on this device only (ADR 0013): a second phone, or the
// web app on the same account, keeps its own. localStorage is enough — the
// WebView keeps it across launches — and a tiny external store lets the
// settings section and the scheduler share one value without a provider.

import * as React from "react"

import {
  parseReminderSettings,
  serializeReminderSettings,
  type ReminderSettings,
} from "@/lib/reminders"

const KEY = "yaffle:reminders:v1"

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

let cached: ReminderSettings | null = null
const listeners = new Set<() => void>()

export function readReminderSettings(): ReminderSettings {
  if (cached) return cached
  let raw: string | null
  try {
    raw = storage()?.getItem(KEY) ?? null
  } catch {
    raw = null
  }
  cached = parseReminderSettings(raw)
  return cached
}

export function writeReminderSettings(next: ReminderSettings): void {
  const serialized = serializeReminderSettings(next)
  cached = parseReminderSettings(serialized)
  try {
    storage()?.setItem(KEY, serialized)
  } catch {
    // Storage full or disabled: the in-memory value still drives this session.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current reminder settings and a setter that persists them. */
export function useReminderSettings(): [
  ReminderSettings,
  (next: ReminderSettings) => void,
] {
  const settings = React.useSyncExternalStore(
    subscribe,
    readReminderSettings,
    readReminderSettings,
  )
  return [settings, writeReminderSettings]
}

/** Test seam: forget the cached value so the next read hits storage. */
export function resetReminderSettingsCache(): void {
  cached = null
}

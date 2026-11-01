import * as React from "react"

import { listenToDay, type Entry } from "@/data/entries"
import { DEFAULT_GOAL_KCAL } from "@/data/goal"
import { useGoal, useGoalStatus, useIdentity } from "@/data/hooks"
import { localDay } from "@/lib/day"
import { db } from "@/lib/firebase"
import { useI18n } from "@/lib/i18n/useI18n"

import { pushWidgetSnapshot, widgetSupported } from "./widget"
import { buildWidgetSnapshot, msUntilNextDay } from "./widget-snapshot"

/**
 * Today's Day, rolling over at local midnight while the app stays open, and
 * re-read whenever the app comes back to the foreground (a sleeping phone can
 * hold a timer well past midnight).
 */
function useToday(): string {
  const [today, setToday] = React.useState(() => localDay(new Date()))
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      setToday(localDay(new Date()))
      clearTimeout(timer)
      // A second past midnight, so the rollover never lands a hair early.
      timer = setTimeout(refresh, msUntilNextDay() + 1000)
    }
    refresh()
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])
  return today
}

/**
 * Keeps the home screen widget's snapshot in step with today's Entries, the
 * Goal and the app language. Holds its own today's-Day listener — always
 * today, whatever Day the main screen shows — which the Firestore SDK serves
 * from the same cache and stream as the screen's own (ADR 0001), so it adds no
 * reads. It renders nothing and never delays first paint: the snapshot is
 * written after render, and only once both the Goal and today's Entries have
 * actually been heard from, so the widget never flashes a fallback.
 */
function WidgetSyncImpl() {
  const uid = useIdentity()
  const goal = useGoal(uid)
  const goalStatus = useGoalStatus(uid)
  const today = useToday()
  const { t, n } = useI18n()
  // Tagged with the uid and Day they belong to, so a Day rollover or identity
  // switch never paints the previous one's Entries under the new label.
  const [day, setDay] = React.useState<{
    uid: string
    day: string
    entries: Entry[]
  } | null>(null)

  React.useEffect(() => {
    if (!uid) return
    return listenToDay(db, uid, today, (entries) =>
      setDay({ uid, day: today, entries }),
    )
  }, [uid, today])

  React.useEffect(() => {
    if (!uid || goalStatus === "loading") return
    if (!day || day.uid !== uid || day.day !== today) return
    pushWidgetSnapshot(
      buildWidgetSnapshot({
        day: today,
        entries: day.entries,
        goalKcal: goal?.kcal ?? DEFAULT_GOAL_KCAL,
        t,
        n,
      }),
    )
  }, [uid, goal, goalStatus, day, today, t, n])

  return null
}

/** Mount once, app-wide. Nothing at all outside the Android app. */
export const WidgetSync: React.FC = widgetSupported
  ? WidgetSyncImpl
  : () => null

import * as React from "react"
import { AnimatePresence } from "motion/react"

import {
  addEntry,
  deleteEntry,
  updateEntry,
  type Entry,
  type EntryEdit,
} from "@/data/entries"
import { DEFAULT_GOAL_KCAL } from "@/data/goal"
import {
  useDay,
  useGoal,
  useIdentity,
  useLoggedDays,
  useSyncStatus,
} from "@/data/hooks"
import { refreshIdentity } from "@/data/identity"
import { localDay, stepDay } from "@/lib/day"
import { auth, db } from "@/lib/firebase"
import { useDaySwipe } from "@/lib/useDaySwipe"
import { SettingsSheet } from "@/screens/settings/SettingsSheet"
import { AddCard } from "./AddCard"
import { DayNav } from "./DayNav"
import { EntryList } from "./EntryList"
import type { EntryDraft } from "./fields"
import { Header } from "./Header"
import { SummaryCard } from "./SummaryCard"
import { summarize } from "./summary"
import { UndoSnackbar } from "./UndoSnackbar"
import { WeekStrip } from "./WeekStrip"

// Undo window for a deleted Entry (ADR 0004 — in-memory, deferred).
const DELETE_UNDO_MS = 6000

// The walking skeleton (#15): the shell wired to live data for the full manual
// loop — add, edit, delete+undo, Backfill and Day navigation — all offline
// capable through the Firestore cache (ADR 0001).
export function MainScreen() {
  const uid = useIdentity()
  const [selectedDay, setSelectedDay] = React.useState(() =>
    localDay(new Date()),
  )
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  // The Entry awaiting a deferred delete — hidden from the log while its undo
  // snackbar is up; the real delete fires only when the window lapses.
  const [pending, setPending] = React.useState<Entry | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )

  const dayEntries = useDay(uid, selectedDay)
  const goal = useGoal(uid)
  const loggedDays = useLoggedDays(uid)
  const syncStatus = useSyncStatus(uid)

  const clearTimer = () => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
  }

  React.useEffect(() => clearTimer, [])

  // A pending Entry is optimistically gone: excluded from the log and the ring
  // until undone, restored the instant it is.
  const visible = pending
    ? dayEntries.filter((e) => e.id !== pending.id)
    : dayEntries
  const goalKcal = goal?.kcal ?? DEFAULT_GOAL_KCAL
  const summary = summarize(visible, goalKcal)
  const newestFirst = React.useMemo(() => [...visible].reverse(), [visible])

  // Commit any pending delete, then move to another Day — closing the editor
  // so nothing edits across a Day switch.
  const goToDay = (day: string) => {
    clearTimer()
    if (pending && uid) deleteEntry(db, uid, pending.id)
    setPending(null)
    setEditingId(null)
    setSelectedDay(day)
  }
  const step = (delta: -1 | 1) => goToDay(stepDay(selectedDay, delta))
  const swipe = useDaySwipe(step)

  const handleAdd = (draft: EntryDraft) => {
    if (!uid) return
    addEntry(db, uid, { date: selectedDay, source: "manual", ...draft })
  }

  const handleSave = (id: string, edit: EntryEdit) => {
    if (uid) updateEntry(db, uid, id, edit)
    setEditingId(null)
  }

  const requestDelete = (entry: Entry) => {
    setEditingId(null)
    // Finalize a prior pending delete before deferring this one.
    if (pending && uid) deleteEntry(db, uid, pending.id)
    clearTimer()
    setPending(entry)
    timer.current = setTimeout(() => {
      if (uid) deleteEntry(db, uid, entry.id)
      timer.current = undefined
      setPending(null)
    }, DELETE_UNDO_MS)
  }

  const undo = () => {
    clearTimer()
    setPending(null)
  }

  const openSettings = () => setSettingsOpen(true)
  const reauth = () => void refreshIdentity(auth)

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col">
      <Header
        onOpenSettings={openSettings}
        syncStatus={syncStatus}
        onReauth={reauth}
      />
      <main className="flex flex-1 flex-col">
        <div {...swipe}>
          <WeekStrip
            selectedDay={selectedDay}
            loggedDays={loggedDays}
            onSelect={goToDay}
          />
          <DayNav
            selectedDay={selectedDay}
            onStep={step}
            onToday={() => goToDay(localDay(new Date()))}
          />
          <AddCard onAdd={handleAdd} disabled={!uid} />
          <EntryList
            entries={newestFirst}
            editingId={editingId}
            onStartEdit={setEditingId}
            onSaveEdit={handleSave}
            onCancelEdit={() => setEditingId(null)}
            onDelete={requestDelete}
          />
        </div>
        <div className="flex-1" />
        <div className="sticky bottom-0 px-3 pb-3">
          <AnimatePresence initial={false}>
            {pending && <UndoSnackbar key="undo" onUndo={undo} />}
          </AnimatePresence>
          <SummaryCard summary={summary} onOpenSettings={openSettings} />
        </div>
      </main>
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

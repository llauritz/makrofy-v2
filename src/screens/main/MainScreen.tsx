import * as React from "react"
import { AnimatePresence } from "motion/react"

import {
  addEntry,
  deleteEntry,
  updateEntry,
  type Entry,
  type EntryEdit,
  type EntrySource,
} from "@/data/entries"
import { DEFAULT_GOAL_KCAL } from "@/data/goal"
import {
  useDay,
  useGoal,
  useIdentity,
  useLoggedDays,
  useProductIndex,
  useSyncStatus,
} from "@/data/hooks"
import { refreshIdentity } from "@/data/identity"
import { localDay, stepWithinStrip } from "@/lib/day"
import { auth, db } from "@/lib/firebase"
import { useDaySwipe } from "@/lib/useDaySwipe"
import { SettingsSheet } from "@/screens/settings/SettingsSheet"
import { AddCard } from "./AddCard"
import { DayStrip } from "./DayStrip"
import { EntryList } from "./EntryList"
import type { EntryDraft } from "./fields"
import { Header } from "./Header"
import { SummaryCard } from "./SummaryCard"
import { summarize } from "./summary"
import { UndoSnackbar } from "./UndoSnackbar"

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
  const productIndex = useProductIndex(uid)
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
  // The swipe steps ±1 Day, bounded to the strip: it stops at the 14-day floor
  // and, forward, advances the frontier (the calendar ticket lifts the floor).
  const swipeStep = (delta: -1 | 1) => {
    const next = stepWithinStrip(selectedDay, delta)
    if (next) goToDay(next)
  }
  const swipe = useDaySwipe(swipeStep)

  const handleAdd = (draft: EntryDraft, source: EntrySource) => {
    if (!uid) return
    addEntry(db, uid, { date: selectedDay, source, ...draft })
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
        <DayStrip
          selectedDay={selectedDay}
          loggedDays={loggedDays}
          onSelect={goToDay}
        />
        {/* The log is the swipe surface: touch-pan-y lets the browser own
            vertical scroll while horizontal gestures reach the pointer
            handlers un-cancelled — the fix for the dead V1 swipe (#33). The
            Day strip owns its own horizontal scroll, so it stays outside. */}
        <div {...swipe} className="touch-pan-y">
          <AddCard onAdd={handleAdd} index={productIndex} disabled={!uid} />
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

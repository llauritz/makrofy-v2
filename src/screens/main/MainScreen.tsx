import * as React from "react"
import { AnimatePresence } from "motion/react"

import { clearCoverage, setCoverage, type CoverageLevel } from "@/data/days"
import {
  addEntry,
  applyAiFill,
  deleteEntry,
  updateEntry,
  type Entry,
  type EntryAiFill,
  type EntryEdit,
  type EntrySource,
} from "@/data/entries"
import { DEFAULT_GOAL_KCAL } from "@/data/goal"
import {
  useCoverage,
  useDay,
  useGoal,
  useIdentity,
  useLoggedDays,
  useProductIndex,
  useSyncStatus,
} from "@/data/hooks"
import { refreshIdentity } from "@/data/identity"
import { localDay, stepDay } from "@/lib/day"
import { auth, db } from "@/lib/firebase"
import { useDaySwipe } from "@/lib/useDaySwipe"
import { SettingsSheet } from "@/screens/settings/SettingsSheet"
import { AddCard } from "./AddCard"
import { CalendarSheet } from "./CalendarSheet"
import { CoverageControl } from "./CoverageControl"
import { DayStrip } from "./DayStrip"
import { EntryList } from "./EntryList"
import type { EntryDraft } from "./fields"
import { Header } from "./Header"
import { MorningStrip } from "./MorningStrip"
import { SummaryCard } from "./SummaryCard"
import { summarize } from "./summary"
import { UndoSnackbar } from "./UndoSnackbar"

// Undo window for a deleted Entry (ADR 0004 — in-memory, deferred).
const DELETE_UNDO_MS = 6000

// The walking skeleton (#15): the shell wired to live data for the full manual
// loop — add, edit, delete+undo, Backfill and Day navigation — all offline
// capable through the Firestore cache (ADR 0001). `onOpenGlossary` and
// `onOpenStats` lift to the app-level screen switch (#40, #22); Settings and
// the summary card's stats button host the entry points.
export function MainScreen({
  onOpenGlossary,
  onOpenStats,
}: {
  onOpenGlossary: () => void
  onOpenStats: () => void
}) {
  const uid = useIdentity()
  const [selectedDay, setSelectedDay] = React.useState(() =>
    localDay(new Date())
  )
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [calendarOpen, setCalendarOpen] = React.useState(false)
  // The Entry awaiting a deferred delete — hidden from the log while its undo
  // snackbar is up; the real delete fires only when the window lapses.
  const [pending, setPending] = React.useState<Entry | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  const dayEntries = useDay(uid, selectedDay)
  const coverage = useCoverage(uid, selectedDay)
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
  // The swipe steps ±1 Day, unbounded (#34): drifting past the strip's reach
  // is fine — the selection then lives on the calendar button, not a chip.
  const swipe = useDaySwipe((delta) => goToDay(stepDay(selectedDay, delta)))

  const handleAdd = (draft: EntryDraft, source: EntrySource) => {
    if (!uid) return
    addEntry(db, uid, { date: selectedDay, source, ...draft })
  }

  const handleSave = (id: string, edit: EntryEdit) => {
    if (uid) updateEntry(db, uid, id, edit)
    setEditingId(null)
  }

  // A row-level ✨ fill: the missing fields land on the logged Entry (#53).
  const handleAiFill = (id: string, fill: EntryAiFill) => {
    if (uid) applyAiFill(db, uid, id, fill)
  }

  // A Coverage chip tap (#42): re-tapping the stored label removes it — the
  // Day returns to the trusted default (ADR 0006) — any other level replaces it.
  const handleCoverage = (level: CoverageLevel) => {
    if (!uid) return
    if (level === coverage) clearCoverage(db, uid, selectedDay)
    else setCoverage(db, uid, selectedDay, level)
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
          onOpenCalendar={() => setCalendarOpen(true)}
        />
        {/* The log is the swipe surface: touch-pan-y lets the browser own
            vertical scroll while horizontal gestures reach the pointer
            handlers un-cancelled — the fix for the dead V1 swipe (#33). The
            Day strip owns its own horizontal scroll, so it stays outside. */}
        <div {...swipe} className="touch-pan-y">
          <AddCard onAdd={handleAdd} index={productIndex} uid={uid} />
          <EntryList
            entries={newestFirst}
            editingId={editingId}
            uid={uid}
            onStartEdit={setEditingId}
            onSaveEdit={handleSave}
            onCancelEdit={() => setEditingId(null)}
            onDelete={requestDelete}
            onAiFill={handleAiFill}
          />
          <CoverageControl
            day={selectedDay}
            entryCount={visible.length}
            level={coverage}
            onSelect={handleCoverage}
          />
        </div>
        <div className="flex-1" />
        <div className="sticky bottom-0 px-3 pb-3">
          <AnimatePresence initial={false}>
            {pending && <UndoSnackbar key="undo" onUndo={undo} />}
          </AnimatePresence>
          <MorningStrip uid={uid} goalKcal={goalKcal} />
          <SummaryCard
            summary={summary}
            onOpenSettings={openSettings}
            onOpenStats={onOpenStats}
          />
        </div>
      </main>
      <CalendarSheet
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        selectedDay={selectedDay}
        loggedDays={loggedDays}
        onPick={(day) => {
          goToDay(day)
          setCalendarOpen(false)
        }}
      />
      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onOpenGlossary={() => {
          setSettingsOpen(false)
          onOpenGlossary()
        }}
      />
    </div>
  )
}

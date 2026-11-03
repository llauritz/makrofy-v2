import * as React from "react"

// Fills on their way to the server. The aiFill function counts a fill in the
// cycle doc when it admits it (ADR 0016), and that count reaches the phone a
// moment later through the cycle listener. Until it does, the counter shows
// the tapped fill anyway, so it moves with the tap as it always has.
//
// Each pending fill remembers the count it was tapped on; the counter shows
// whichever is higher, that count plus the fills still pending or the
// server's. A fill leaves the list when its call returns, by which time the
// server's count has long arrived.

interface Pending {
  id: number
  cycleId: string
  base: number
}

let pending: Pending[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/** Note a fill as tapped; returns the call that settles it. */
export function notePendingFill(cycleId: string, base: number): () => void {
  const id = nextId++
  pending = [...pending, { id, cycleId, base }]
  emit()
  return () => {
    pending = pending.filter((p) => p.id !== id)
    emit()
  }
}

/** The fill count to show for a cycle, given the server's. */
export function shownFills(
  list: readonly Pending[],
  cycleId: string,
  serverFills: number
): number {
  const mine = list.filter((p) => p.cycleId === cycleId)
  if (mine.length === 0) return serverFills
  const base = Math.max(...mine.map((p) => p.base))
  return Math.max(serverFills, base + mine.length)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The pending fills, live. */
export function usePendingFills(): readonly Pending[] {
  return React.useSyncExternalStore(
    subscribe,
    () => pending,
    () => pending
  )
}

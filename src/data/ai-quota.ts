import {
  doc,
  getDoc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore"

// The app-side per-user daily AI quota (spec § AI macro-fill, #21). Advisory
// by design and by admission: App Check is the hard gate against non-app
// clients and the budget alert the backstop — this counter is what keeps one
// legitimate identity (Guests included) from burning the grounding budget.
// One doc per Day at /users/{uid}/aiUsage/{YYYY-MM-DD}, covered by the
// generic UID-match security rules; days without uses have no doc.

/**
 * Round trips per identity per Day — each is one billable call, and a fill
 * that needs its one clarifying question costs two. Consumed before the call
 * (a failed call still hit the service), and checked before each trip, so at
 * the limit's edge a question can land whose answer is refused — acceptable
 * for an advisory brake. 40 calls/day is far above honest logging, far below
 * what hurts the 5k/month free grounding quota.
 */
export const AI_DAILY_LIMIT = 40

/** How many AI uses this identity has consumed on a Day; no doc means none. */
export async function readAiUsage(
  db: Firestore,
  uid: string,
  day: string
): Promise<number> {
  const snap = await getDoc(usageDoc(db, uid, day))
  const count = snap.data()?.count
  return typeof count === "number" ? count : 0
}

/**
 * Record one AI use (one round trip — a clarifying question's answer counts
 * again). Queued, not awaited, like every other write (ADR 0001); the check
 * against AI_DAILY_LIMIT happens at the ✨ button with readAiUsage.
 */
export function consumeAiUse(db: Firestore, uid: string, day: string): void {
  const ref = usageDoc(db, uid, day)
  setDoc(
    ref,
    { count: increment(1), updatedAt: serverTimestamp() },
    { merge: true }
  ).catch((err) => {
    console.error("AI usage write failed", day, err)
  })
}

function usageDoc(db: Firestore, uid: string, day: string) {
  return doc(db, "users", uid, "aiUsage", day)
}

// The plan cycle counter (ADR 0013, #64), which replaces the daily quota once
// billing is switched on. One doc per 30-day cycle at
// /users/{uid}/aiCycles/{cycle start as ISO}, written by the client — the
// limit is advisory, honest-user UX and not security; App Check and the
// per-user RPM cap are the enforced controls. Three numbers, counted as each
// round trip starts (grounded once its reply is in):
//   fills    — ✨ interactions, the allowance unit (a clarifying answer rides free)
//   calls    — round trips, fills plus clarifying answers
//   grounded — round trips where Google Search informed the answer
// grounded ÷ fills is the queries-per-fill figure #60's price check waits on.
// Until billing is on, the daily quota above still gates and this only counts.

export interface CycleUsage {
  fills: number
  calls: number
  grounded: number
}

/** The cycle doc's id: its start instant, so a re-anchor never reuses one. */
export function cycleDocId(start: Date): string {
  return start.toISOString()
}

/** Observe one cycle's counts; zeros before its first use. */
export function listenToCycleUsage(
  db: Firestore,
  uid: string,
  cycleId: string,
  onChange: (usage: CycleUsage) => void
): Unsubscribe {
  return onSnapshot(
    cycleDoc(db, uid, cycleId),
    (snap) => {
      const data = snap.data()
      const num = (v: unknown) => (typeof v === "number" ? v : 0)
      onChange({
        fills: num(data?.fills),
        calls: num(data?.calls),
        grounded: num(data?.grounded),
      })
    },
    (err) => console.error("AI cycle listener failed", cycleId, err)
  )
}

/**
 * Count one round trip the moment it starts, so the counter moves with the
 * tap rather than when the reply lands. `fill` is false for the answer to a
 * clarifying question. Queued, not awaited (ADR 0001) — the listener sees the
 * new count at once, offline too.
 */
export function recordAiCall(
  db: Firestore,
  uid: string,
  cycleId: string,
  { fill }: { fill: boolean }
): void {
  bump(db, uid, cycleId, {
    fills: increment(fill ? 1 : 0),
    calls: increment(1),
  })
}

/** Count a round trip whose reply came back with Search attribution. */
export function recordGrounded(
  db: Firestore,
  uid: string,
  cycleId: string
): void {
  bump(db, uid, cycleId, { grounded: increment(1) })
}

function bump(
  db: Firestore,
  uid: string,
  cycleId: string,
  counts: Record<string, ReturnType<typeof increment>>
): void {
  setDoc(
    cycleDoc(db, uid, cycleId),
    { ...counts, updatedAt: serverTimestamp() },
    { merge: true }
  ).catch((err) => {
    console.error("AI cycle write failed", cycleId, err)
  })
}

function cycleDoc(db: Firestore, uid: string, cycleId: string) {
  return doc(db, "users", uid, "aiCycles", cycleId)
}

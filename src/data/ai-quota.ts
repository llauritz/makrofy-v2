import {
  doc,
  onSnapshot,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore"

// The plan cycle counter (ADR 0013, #64), as the app reads it. One doc per
// 30-day cycle at /users/{uid}/aiCycles/{cycle start as ISO}. Only the aiFill
// function writes it (ADR 0016): it counts each round trip in the same
// transaction that admits it, so the limit holds on the server and the
// security rules refuse every client write. Numbers kept:
//   fills    — ✨ interactions, the allowance unit (a clarifying answer rides free)
//   calls    — round trips, fills plus clarifying answers
//   grounded — round trips where Google Search informed the answer
//   queries  — billed search queries (grounded counts a 7-query fill once)

export { cycleDocId } from "../../functions/src/ai-allowance"

export interface CycleUsage {
  fills: number
  calls: number
  grounded: number
}

/** Observe one cycle's counts; zeros before its first use. */
export function listenToCycleUsage(
  db: Firestore,
  uid: string,
  cycleId: string,
  onChange: (usage: CycleUsage) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "users", uid, "aiCycles", cycleId),
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

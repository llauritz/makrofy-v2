import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  type Firestore,
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

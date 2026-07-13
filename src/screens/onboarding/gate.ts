// The pure first-run gate. Onboarding is a one-way door driven by data, not a
// route: a fresh profile has no Goal doc, so we show the goal screen; the
// instant it is written the synced Goal turns up and the app switches to the
// main screen (spec § Onboarding). Kept free of React/Firestore so the
// no-flash rule is testable.
import type { GoalStatus } from "@/data/goal"

/** The three top-level things the app can be showing. */
export type AppView = "loading" | "onboarding" | "main"

export function resolveAppView(
  uid: string | null,
  goalStatus: GoalStatus,
): AppView {
  // Nothing is decidable without an identity — and we must never offer
  // onboarding before there is a uid to write the Goal against.
  if (uid === null) return "loading"
  if (goalStatus === "loading") return "loading"
  return goalStatus === "unset" ? "onboarding" : "main"
}

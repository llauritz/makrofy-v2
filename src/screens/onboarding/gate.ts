// The pure first-run gate. Onboarding is a one-way door driven by data, not a
// route: a fresh profile has no Goal doc, so we show onboarding; the instant
// it is written the synced Goal turns up and the app switches to the main
// screen (spec § Onboarding). Kept free of React/Firestore so the no-flash
// rule is testable.
//
// A profile with Entries but no Goal logged while onboarding was parked
// (#17–#35) and set its goal in Settings, or never did. It is past first run,
// so it goes straight to the main screen, never back through onboarding.
import type { EntriesStatus } from "@/data/entries"
import type { GoalStatus } from "@/data/goal"

/** The three top-level things the app can be showing. */
export type AppView = "loading" | "onboarding" | "main"

export function resolveAppView(
  uid: string | null,
  goalStatus: GoalStatus,
  entriesStatus: EntriesStatus,
): AppView {
  // Nothing is decidable without an identity — and we must never offer
  // onboarding before there is a uid to write the Goal against.
  if (uid === null) return "loading"
  if (goalStatus === "loading") return "loading"
  if (goalStatus === "set") return "main"
  // No Goal: only a profile that has never logged is on its first run.
  if (entriesStatus === "loading") return "loading"
  return entriesStatus === "some" ? "main" : "onboarding"
}

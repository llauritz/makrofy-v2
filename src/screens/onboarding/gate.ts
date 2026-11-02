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

/**
 * Which view to show. `freshDevice` means this device has never held a
 * profile (no boot mirror, ADR 0011): the identity about to be minted is a
 * brand-new Guest, which by construction has no Goal and no Entries. Waiting
 * on the sign-in and two server answers to learn that only kept a first-time
 * visitor on the splash for seconds, so on a fresh device the undecided
 * states show onboarding straight away; the real answers still win once they
 * arrive (a Goal turning up — say, a Google sign-in from Welcome — moves on to
 * the main screen). Anywhere else, undecided still means the splash, so a
 * returning user never flashes onboarding.
 */
export function resolveAppView(
  uid: string | null,
  goalStatus: GoalStatus,
  entriesStatus: EntriesStatus,
  freshDevice = false,
): AppView {
  const undecided = freshDevice ? "onboarding" : "loading"
  if (uid === null) return undecided
  if (goalStatus === "loading") return undecided
  if (goalStatus === "set") return "main"
  // No Goal: only a profile that has never logged is on its first run.
  if (entriesStatus === "loading") return undecided
  return entriesStatus === "some" ? "main" : "onboarding"
}

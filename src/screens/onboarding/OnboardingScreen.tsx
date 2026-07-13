import * as React from "react"
import { motion } from "motion/react"

import { DEFAULT_GOAL_KCAL } from "@/data/goal"
import { parseGoalKcal } from "@/lib/goal-input"

// PARKED — not currently mounted. This first-run screen shipped in #17 but is
// being reworked in issue #35; App sends every profile straight to the main
// screen for now (goal set in Settings). Kept in the tree as the starting point
// for that rework. See the gate in ./gate.ts.
//
// First run: one goal screen, then straight in (spec § Onboarding). The kcal
// field is prefilled with the V1 default so accepting it is a single tap —
// that prefill is what keeps "fresh profile → logging an Entry in ≤2 taps"
// true. A blank or garbled field falls back to the same default rather than
// blocking the way in; the goal is editable later in Settings.
export function OnboardingScreen({
  onSubmit,
}: {
  onSubmit: (kcal: number) => void
}) {
  const [value, setValue] = React.useState(String(DEFAULT_GOAL_KCAL))
  const submit = () => onSubmit(parseGoalKcal(value) ?? DEFAULT_GOAL_KCAL)

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-7 pb-16">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 26 }}
      >
        <div className="font-wordmark text-4xl leading-none font-semibold">
          Yaffle
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Set a daily calorie goal to get started. You can change it any time in
          Settings.
        </p>

        <div className="mt-9">
          <label
            htmlFor="onboarding-goal"
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            Daily goal
          </label>
          <div className="mt-2 flex items-baseline gap-2 border-b-2 border-border pb-2 focus-within:border-foreground">
            <input
              id="onboarding-goal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  submit()
                }
              }}
              onFocus={(e) => e.target.select()}
              inputMode="numeric"
              autoComplete="off"
              aria-label="Daily calorie goal"
              className="min-w-0 flex-1 bg-transparent text-4xl font-bold tabular-nums outline-none"
            />
            <span className="text-lg font-medium text-muted-foreground">
              kcal
            </span>
          </div>
        </div>

        <motion.button
          type="button"
          onClick={submit}
          whileTap={{ scale: 0.98 }}
          className="mt-10 w-full rounded-full bg-primary py-3.5 text-[15px] font-semibold text-primary-foreground"
        >
          Get started
        </motion.button>
      </motion.div>
    </div>
  )
}

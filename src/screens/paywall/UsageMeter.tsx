import { motion } from "motion/react"
import * as React from "react"

import { useI18n } from "@/lib/i18n/useI18n"
import { HintCard } from "@/screens/main/AiZone"
import { SPRING } from "@/screens/main/anim"
import { FadeSwap } from "@/screens/main/FadeSwap"
import { usePaywall } from "./Paywall"

// The free plan's ✨ counter on the add card (#65). Two parts: a quiet
// "3/10 free AI fills used" line under the macros, shown while the AI zone has
// something to say (after a fill), and a thin line along the card's bottom
// edge that fills to the share used. When the last free fill is spent the line
// gives way to the plans card — the same hint card the ✨ refusal raises — so
// the way up appears on the 10th fill, not only on the 11th tap. Free only:
// paid plans don't count down on the card. Dark without ?paywall.

/**
 * The text line or the plans card, under the AI zone.
 * `zoneActive`: the AI zone is showing a result, so a fill just happened.
 * `refusalShowing`: the zone already holds the ✨ refusal's plans card.
 */
export function UsageNote({
  zoneActive,
  refusalShowing,
}: {
  zoneActive: boolean
  refusalShowing: boolean
}) {
  const { t, n } = useI18n()
  const paywall = usePaywall()
  const [dismissedAt, setDismissedAt] = React.useState<number | null>(null)
  const cycle = paywall?.cycle
  const free = cycle?.plan === "free"

  let content: React.ReactNode = null
  let key = "none"
  if (cycle && free) {
    if (
      cycle.remaining === 0 &&
      !refusalShowing &&
      dismissedAt !== cycle.used
    ) {
      key = "card"
      content = (
        <HintCard
          hint={t.paywall.exhaustedFree(n(cycle.limit))}
          upgrade
          onDismiss={() => setDismissedAt(cycle.used)}
        />
      )
    } else if (zoneActive && cycle.used > 0 && cycle.remaining > 0) {
      key = `text:${cycle.used}`
      content = (
        <div className="px-1 pt-2 text-[11px] text-muted-foreground tabular-nums">
          {t.paywall.usageMeter(n(cycle.used), n(cycle.limit))}
        </div>
      )
    }
  }

  if (!free) return null
  return <FadeSwap swapKey={key}>{content}</FadeSwap>
}

/** The thin fill line on the card's bottom edge; the card's squircle clips it. */
export function UsageLine() {
  const paywall = usePaywall()
  const cycle = paywall?.cycle
  if (!cycle || cycle.plan !== "free" || cycle.used === 0) return null
  const pct = Math.min(100, (cycle.used / cycle.limit) * 100)
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute bottom-0 left-0 h-[3px] bg-foreground/55"
      initial={false}
      animate={{ width: `${pct}%` }}
      transition={SPRING}
    />
  )
}

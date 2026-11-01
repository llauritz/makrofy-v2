import { motion } from "motion/react"
import * as React from "react"

import { useI18n } from "@/lib/i18n/useI18n"
import { HintCard } from "@/screens/main/AiZone"
import { SPRING } from "@/screens/main/anim"
import { FadeSwap } from "@/screens/main/FadeSwap"
import { usePaywall } from "./Paywall"

// The free plan's ✨ counter on the add card (#65): one row under the AI
// zone, shown after a fill — "3/10 free AI fills used" with a thin
// round-capped line beneath it filling to the share used, and an outlined
// See plans button on the right. The row is no taller than the button, so the
// counter costs the card almost no height. When the last free fill is spent
// the row gives way to the plans card — the same hint card the ✨ refusal
// raises — so the way up appears on the 10th fill, not only on the 11th tap.
// Free only: paid plans don't count down on the card. Dark without ?paywall.

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
      // A stable key: the count and line update in place, no fade-through.
      key = "meter"
      content = (
        <MeterRow
          used={cycle.used}
          limit={cycle.limit}
          onSeePlans={() => paywall?.open("browse")}
        />
      )
    }
  }

  if (!free) return null
  return <FadeSwap swapKey={key}>{content}</FadeSwap>
}

function MeterRow({
  used,
  limit,
  onSeePlans,
}: {
  used: number
  limit: number
  onSeePlans: () => void
}) {
  const { t, n } = useI18n()
  const pct = Math.min(100, (used / limit) * 100)
  return (
    <div className="flex items-center justify-between gap-4 pt-2 pl-1">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[11px] text-muted-foreground tabular-nums">
          {t.paywall.usageMeter(n(used), n(limit))}
        </span>
        <div
          aria-hidden
          className="h-[2px] overflow-hidden rounded-full bg-foreground/10"
        >
          <motion.div
            className="h-full rounded-full bg-foreground/60"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={SPRING}
          />
        </div>
      </div>
      {/* A plain CSS border, not a <Squircle> stroke: the row centres this
          pill on half pixels, and an SVG hairline there anti-aliases unevenly
          (heavier top/left, faint bottom), where the browser snaps a border
          to whole device pixels. At 26px tall a pill's squircle smoothing is
          invisible, so nothing is lost. */}
      <motion.button
        type="button"
        onClick={onSeePlans}
        whileTap={{ scale: 0.95 }}
        className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium"
      >
        {t.paywall.seePlans}
      </motion.button>
    </div>
  )
}

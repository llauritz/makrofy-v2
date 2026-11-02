import { AiSparkle } from "@/components/AiSparkle"
import { Button } from "@/components/ui/button"
import { Squircle } from "@/components/ui/squircle"
import * as React from "react"

import { isEntitling } from "@/data/entitlement"
import { openExternal, portalLink } from "@/lib/billing"
import { formatShortDate } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/useI18n"
import { usePaywall } from "@/screens/paywall/Paywall"

// The Settings plan row (#65): the plan, what's left of the ✨ allowance, and
// — for paid plans — the cycle's reset date, which #64 says must be findable
// here. Free gets Upgrade, which opens the plans. Anyone with a Paddle
// subscription gets Manage, which opens Paddle's customer portal (cancel,
// card, invoices — #66). A failed payment or a scheduled end takes over the
// status line. Free never shows a date: its tries refill silently and the
// copy neither promises nor denies it. Renders nothing while billing is off.
export function PlanSetting({ onOpen }: { onOpen: () => void }) {
  const { t, n, language } = useI18n()
  const paywall = usePaywall()
  const [problem, setProblem] = React.useState(false)
  if (paywall === null) return null
  const { cycle, entitlement } = paywall
  const date = formatShortDate(cycle.resetsOn, language)
  const subscribed =
    entitlement !== null &&
    entitlement.plan !== "free" &&
    isEntitling(entitlement.status)

  const name =
    cycle.plan === "free"
      ? t.paywall.aiFill
      : cycle.plan === "pro"
        ? t.paywall.planPro
        : t.paywall.planUnlimited
  const status = problem
    ? t.paywall.billingError
    : entitlement?.status === "past_due" && subscribed
      ? t.paywall.pastDueStatus
      : entitlement?.cancelsAt && subscribed
        ? t.paywall.endingStatus(
            n(cycle.remaining),
            formatShortDate(entitlement.cancelsAt, language)
          )
        : cycle.plan === "free"
          ? t.paywall.freeStatus(n(cycle.remaining), n(cycle.limit))
          : cycle.plan === "pro"
            ? t.paywall.proStatus(n(cycle.remaining), n(cycle.limit), date)
            : t.paywall.unlimitedStatus(n(cycle.used), date)

  return (
    // 32px badge hung into the left padding, matching the account photo and
    // the Export / Import icon slots below (one icon centre, one text edge).
    <Squircle radius="2xl" className="flex items-center gap-2.5 py-3 pr-4 pl-1">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
        <AiSparkle className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{name}</div>
        <div className="line-clamp-2 text-[13px] text-muted-foreground">
          {status}
        </div>
      </div>
      <Button
        variant={subscribed ? "outline" : "default"}
        size="sm"
        onClick={() => {
          if (subscribed) {
            setProblem(false)
            openExternal(portalLink).catch((err) => {
              console.error("Customer portal failed", err)
              setProblem(true)
            })
            return
          }
          onOpen()
          paywall.open("browse")
        }}
      >
        {subscribed ? t.paywall.manage : t.paywall.upgrade}
      </Button>
    </Squircle>
  )
}

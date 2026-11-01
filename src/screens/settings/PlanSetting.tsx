import { AiSparkle } from "@/components/AiSparkle"
import { Button } from "@/components/ui/button"
import { Squircle } from "@/components/ui/squircle"
import { formatShortDate } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/useI18n"
import { usePaywall } from "@/screens/paywall/Paywall"

// The Settings plan row (#65): the plan, what's left of the ✨ allowance, and
// — for paid plans — the cycle's reset date, which #64 says must be findable
// here. Free gets Upgrade; paid gets Manage (the Paddle portal arrives with
// #66; the prototype opens the paywall on the plan above). Free never shows a
// date: its tries refill silently and the copy neither promises nor denies it.
// Renders nothing while the paywall prototype is off.
export function PlanSetting({ onOpen }: { onOpen: () => void }) {
  const { t, n, language } = useI18n()
  const paywall = usePaywall()
  if (paywall === null) return null
  const { cycle } = paywall
  const date = formatShortDate(cycle.resetsOn, language)

  const name =
    cycle.plan === "free"
      ? t.paywall.aiFill
      : cycle.plan === "pro"
        ? t.paywall.planPro
        : t.paywall.planUnlimited
  const status =
    cycle.plan === "free"
      ? t.paywall.freeStatus(n(cycle.remaining), n(cycle.limit))
      : cycle.plan === "pro"
        ? t.paywall.proStatus(n(cycle.remaining), n(cycle.limit), date)
        : t.paywall.unlimitedStatus(n(cycle.used), date)

  return (
    <Squircle radius="2xl" className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
        <AiSparkle className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{name}</div>
        <div className="truncate text-[13px] text-muted-foreground">
          {status}
        </div>
      </div>
      <Button
        variant={cycle.plan === "free" ? "default" : "outline"}
        size="sm"
        onClick={() => {
          onOpen()
          paywall.open("browse")
        }}
      >
        {cycle.plan === "free" ? t.paywall.upgrade : t.paywall.manage}
      </Button>
    </Squircle>
  )
}

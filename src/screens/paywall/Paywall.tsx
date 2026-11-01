/* eslint-disable react-refresh/only-export-components */
import { Check, Heart } from "lucide-react"
import { motion } from "motion/react"
import * as React from "react"

import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet"
import { AiSparkle } from "@/components/AiSparkle"
import { Button } from "@/components/ui/button"
import { Squircle, SquircleOutline } from "@/components/ui/squircle"
import { useAuthUser } from "@/data/hooks"
import { startGoogleSignIn } from "@/data/identity"
import {
  aiCycle,
  annualSavingPct,
  CYCLE_LIMIT,
  perMonth,
  PRICE_USD,
  type AiCycle,
  type Billing,
  type Plan,
} from "@/data/plans"
import { auth } from "@/lib/firebase"
import { formatPrice, formatShortDate } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/useI18n"
import { cn } from "@/lib/utils"
import { readPaywallPreview } from "./preview"

// The paywall prototype (#65): one bottom sheet presenting the three-plan
// ladder from #59/#60 — Free / Pro / Unlimited, Pro centre-stage and marked
// best value (compromise + centre-stage, pricing note §5), yearly first with
// monthly one tap away. It opens from the ✨ refusal at cycle exhaustion (the
// front door) and from the Settings plan row. Guests sign in with Google on
// the way to checkout (ADR 0002: link in place, no guest checkout). Checkout
// itself is #66, so the paid CTA is a stub.
//
// Everything here is dark unless the URL carries ?paywall (see ./preview):
// without it `usePaywall()` is null and no surface renders.

type PaidPlan = Exclude<Plan, "free">

/** Why the sheet opened — it picks the heading. */
export type PaywallReason = "exhausted" | "browse"

type PaywallApi = {
  cycle: AiCycle
  open: (reason: PaywallReason) => void
  /** Count one ✨ fill against the cycle — the prototype's stand-in for #64's counter. */
  consume: () => void
}

const PaywallContext = React.createContext<PaywallApi | null>(null)

/** The prototype's plan state and opener, or null when the paywall is off. */
export function usePaywall(): PaywallApi | null {
  return React.useContext(PaywallContext)
}

export function PaywallProvider({ children }: { children: React.ReactNode }) {
  const [preview] = React.useState(() =>
    readPaywallPreview(window.location.search)
  )
  const [reason, setReason] = React.useState<PaywallReason | null>(null)
  const [noticeOpen, setNoticeOpen] = React.useState(
    preview?.showNotice ?? false
  )
  // The prototype's counter lives in memory: each ✨ fill bumps it, so the
  // add card's meter fills up and the 10th fill brings on the plans card.
  const [used, setUsed] = React.useState(preview?.cycle.used ?? 0)
  const api = React.useMemo<PaywallApi | null>(
    () =>
      preview && {
        cycle: aiCycle(preview.cycle.plan, used, preview.cycle.resetsOn),
        open: setReason,
        consume: () => setUsed((u) => Math.min(u + 1, preview.cycle.limit)),
      },
    [preview, used]
  )

  if (api === null) return children
  return (
    <PaywallContext.Provider value={api}>
      {children}
      <PaywallSheet
        cycle={api.cycle}
        reason={reason}
        onOpenChange={(open) => !open && setReason(null)}
      />
      <PlansNotice
        open={noticeOpen}
        onOpenChange={setNoticeOpen}
        onSeePlans={() => {
          setNoticeOpen(false)
          setReason("browse")
        }}
      />
    </PaywallContext.Provider>
  )
}

function PaywallSheet({
  cycle,
  reason,
  onOpenChange,
}: {
  cycle: AiCycle
  reason: PaywallReason | null
  onOpenChange: (open: boolean) => void
}) {
  const { t, n, language } = useI18n()
  const user = useAuthUser()
  const guest = user === null || user.isAnonymous
  const [billing, setBilling] = React.useState<Billing>("annual")
  // A paid user is offered the plan above theirs; everyone else Pro.
  const [chosen, setChosen] = React.useState<PaidPlan>(
    cycle.plan === "free" ? "pro" : "unlimited"
  )
  const [stubbed, setStubbed] = React.useState(false)

  const date = formatShortDate(cycle.resetsOn, language)
  const { title, body } = heading(t, n, cycle, reason ?? "browse", date)
  const planName: Record<Plan, string> = {
    free: t.paywall.planFree,
    pro: t.paywall.planPro,
    unlimited: t.paywall.planUnlimited,
  }
  const canChoose = chosen !== cycle.plan

  return (
    <BottomSheet
      open={reason !== null}
      onOpenChange={(open) => {
        if (!open) setStubbed(false)
        onOpenChange(open)
      }}
    >
      <BottomSheetContent className="max-h-[92svh] gap-5 overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
            <AiSparkle solid className="h-5 w-5" />
          </span>
          <BottomSheetClose />
        </div>
        <div className="flex flex-col gap-1.5">
          <BottomSheetTitle className="text-[22px] leading-tight font-semibold">
            {title}
          </BottomSheetTitle>
          <BottomSheetDescription className="text-sm text-muted-foreground">
            {body}
          </BottomSheetDescription>
        </div>

        <BillingToggle value={billing} onChange={setBilling} />

        <div role="radiogroup" className="flex flex-col gap-2.5">
          <FreeCard current={cycle.plan === "free"} name={planName.free} />
          {(["pro", "unlimited"] as const).map((plan) => (
            <PaidCard
              key={plan}
              plan={plan}
              name={planName[plan]}
              billing={billing}
              selected={chosen === plan}
              current={cycle.plan === plan}
              onSelect={() => setChosen(plan)}
            />
          ))}
        </div>

        {/* One button for everyone. Most subscribers are already signed in;
            a Guest's tap goes through Google sign-in first (ADR 0002: link in
            place, no guest checkout) and comes back to pick up checkout. */}
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="h-12 w-full text-[15px]"
            disabled={user === null || !canChoose}
            onClick={() =>
              guest ? void startGoogleSignIn(auth) : setStubbed(true)
            }
          >
            {t.paywall.continueWith(planName[chosen])}
          </Button>
          {stubbed && (
            <p className="text-center text-[13px] text-muted-foreground">
              {t.paywall.checkoutStub}
            </p>
          )}
        </div>

        <p className="px-1 text-center text-[11px] leading-relaxed text-muted-foreground">
          {t.paywall.footnote}
        </p>
      </BottomSheetContent>
    </BottomSheet>
  )
}

function heading(
  t: ReturnType<typeof useI18n>["t"],
  n: (value: number) => string,
  cycle: AiCycle,
  reason: PaywallReason,
  date: string
): { title: string; body: string } {
  if (cycle.plan === "free") {
    return reason === "exhausted" || cycle.remaining === 0
      ? {
          title: t.paywall.titleExhaustedFree,
          body: t.paywall.bodyExhaustedFree,
        }
      : {
          title: t.paywall.titleBrowseFree,
          body: t.paywall.bodyBrowseFree(n(cycle.remaining), n(cycle.limit)),
        }
  }
  return reason === "exhausted"
    ? {
        title: t.paywall.titleExhaustedPro,
        body: t.paywall.bodyExhaustedPro(date),
      }
    : { title: t.paywall.titleBrowsePaid, body: t.paywall.bodyBrowsePaid(date) }
}

// Yearly | Monthly, yearly first (#60: annual-first display). The saving rides
// on the yearly segment as a quiet tag, using Pro's figure — the plan the
// ladder steers toward.
function BillingToggle({
  value,
  onChange,
}: {
  value: Billing
  onChange: (value: Billing) => void
}) {
  const { t, n } = useI18n()
  const options: ReadonlyArray<{
    value: Billing
    label: string
    tag?: string
  }> = [
    {
      value: "annual",
      label: t.paywall.billingAnnual,
      tag: t.paywall.save(n(annualSavingPct("pro"))),
    },
    { value: "monthly", label: t.paywall.billingMonthly },
  ]
  return (
    <Squircle asChild pill>
      <div
        role="radiogroup"
        aria-label={t.paywall.billing}
        className="flex gap-1 rounded-full bg-input p-1"
      >
        {options.map((option) => {
          const active = option.value === value
          return (
            <div
              key={option.value}
              className={cn(
                "flex flex-1",
                active && "drop-shadow-[0_1px_1px_rgba(43,32,21,0.12)]"
              )}
            >
              <Squircle asChild pill>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange(option.value)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-card text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                  {option.tag && (
                    <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">
                      {option.tag}
                    </span>
                  )}
                </button>
              </Squircle>
            </div>
          )
        })}
      </div>
    </Squircle>
  )
}

// Free sits on the ladder as the first rung, not as a choice: its price is the
// tries it gives, and it never mentions a refill (#59: present remaining tries
// without promising or denying one).
function FreeCard({ current, name }: { current: boolean; name: string }) {
  const { t, n } = useI18n()
  return (
    <Squircle
      radius="2xl"
      outline="solid"
      className="flex items-center gap-3 px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{name}</div>
        <div className="text-[13px] text-muted-foreground">
          {t.paywall.freeLine(n(CYCLE_LIMIT.free))}
        </div>
      </div>
      {current && <CurrentTag />}
    </Squircle>
  )
}

function PaidCard({
  plan,
  name,
  billing,
  selected,
  current,
  onSelect,
}: {
  plan: PaidPlan
  name: string
  billing: Billing
  selected: boolean
  current: boolean
  onSelect: () => void
}) {
  const { t, n, language } = useI18n()
  const price = PRICE_USD[plan]
  const money = (amount: number) => formatPrice(amount, language)
  const headline = billing === "annual" ? perMonth(price.annual) : price.monthly
  const sub =
    billing === "annual"
      ? t.paywall.billedYearly(money(price.annual))
      : t.paywall.billedMonthly
  // Both paid cards state their allowance; Unlimited's 10,000 is its
  // fair-use cap, disclosed right on the card rather than in a footnote.
  const line = t.paywall.paidLine(n(CYCLE_LIMIT[plan]))

  return (
    <Squircle
      asChild
      radius="2xl"
      outline="solid"
      className={cn(
        "relative transition-colors",
        selected ? "bg-card" : "bg-transparent"
      )}
    >
      <motion.button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={current}
        onClick={onSelect}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:cursor-default"
        )}
      >
        {/* The selection ring: a 2px ink stroke on the same squircle path —
            a CSS ring would be shaved by the clip (components/ui/squircle). */}
        {selected && (
          <SquircleOutline
            radius="2xl"
            strokeWidth={2}
            className="text-foreground"
          />
        )}
        <Radio on={selected} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold">{name}</span>
            {plan === "pro" && !current && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold">
                {t.paywall.bestValue}
              </span>
            )}
            {current && <CurrentTag />}
          </div>
          <div className="text-[13px] text-muted-foreground">{line}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
            {/* Unlimited's heart is filled — the bigger support — Pro's is outlined. */}
            <Heart
              className="h-3 w-3 shrink-0"
              fill={plan === "unlimited" ? "currentColor" : "none"}
            />
            {t.paywall.supportsDev}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[15px] font-bold tabular-nums">
            {t.paywall.perMonth(money(headline))}
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {sub}
          </div>
        </div>
      </motion.button>
    </Squircle>
  )
}

function Radio({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        on ? "border-foreground bg-foreground" : "border-muted-foreground/50"
      )}
    >
      {on && <Check className="h-3 w-3 text-background" strokeWidth={3} />}
    </span>
  )
}

function CurrentTag() {
  const { t } = useI18n()
  return (
    <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {t.paywall.currentPlan}
    </span>
  )
}

// The one-time notice for existing users (#59: no grandfathering). Shown once
// in the real build; here it opens on ?paywall=notice.
function PlansNotice({
  open,
  onOpenChange,
  onSeePlans,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSeePlans: () => void
}) {
  const { t, n } = useI18n()
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
          <AiSparkle solid className="h-5 w-5" />
        </span>
        <BottomSheetTitle className="text-[22px] leading-tight font-semibold">
          {t.paywall.noticeTitle}
        </BottomSheetTitle>
        <BottomSheetDescription className="text-[15px] text-muted-foreground">
          {t.paywall.noticeBody(n(CYCLE_LIMIT.free))}
        </BottomSheetDescription>
        <div className="mt-2 flex flex-col gap-2">
          <Button
            size="lg"
            className="h-12 w-full text-[15px]"
            onClick={() => onOpenChange(false)}
          >
            {t.paywall.noticeDismiss}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="h-12 w-full text-[15px]"
            onClick={onSeePlans}
          >
            {t.paywall.seePlans}
          </Button>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}

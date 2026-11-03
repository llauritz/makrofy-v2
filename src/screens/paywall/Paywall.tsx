/* eslint-disable react-refresh/only-export-components */
import { Check, Heart } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
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
import { Segmented } from "@/components/ui/segmented"
import { Spinner } from "@/components/ui/spinner"
import { Squircle, SquircleOutline } from "@/components/ui/squircle"
import { isEntitling, type Entitlement } from "@/data/entitlement"
import { useAuthUser, useIdentity } from "@/data/hooks"
import { startGoogleSignIn } from "@/data/identity"
import {
  annualSavingPct,
  CYCLE_LIMIT,
  perMonth,
  PRICE_USD,
  type AiCycle,
  type Billing,
  type Plan,
} from "@/data/plans"
import {
  changePlan,
  openCheckout,
  openExternal,
  paddleConfigured,
  portalLink,
  previewChange,
  type ChangePreview,
} from "@/lib/billing"
import { auth } from "@/lib/firebase"
import { formatPrice, formatShortDate } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/useI18n"
import { cn } from "@/lib/utils"
import { billingSwitch } from "./switch"
import { useSubscriptionState, type SubscriptionState } from "./useSubscription"

// The paywall (#65, #66): one bottom sheet presenting the three-plan ladder
// from #59/#60 — Free / Pro / Unlimited, Pro centre-stage and marked best
// value (compromise + centre-stage, pricing note §5), yearly first with
// monthly one tap away. It opens from the ✨ refusal at cycle exhaustion (the
// front door) and from the Settings plan row. Guests sign in with Google on
// the way to checkout (ADR 0002: link in place, no guest checkout). A first
// purchase opens Paddle's overlay checkout; someone already paying changes
// plan in place (a second checkout would start a second subscription). The
// plan itself only ever arrives through the webhook-written entitlement doc
// (ADR 0012), which the listener picks up a few seconds after payment.
//
// Everything here is dark until billing is switched on (see ./switch): then
// `usePaywall()` is null and no surface renders. The cycle counter runs
// regardless — `useAiCycleState()` — so the fill telemetry exists before
// launch (ADR 0013).

type PaidPlan = Exclude<Plan, "free">

/** Why the sheet opened — it picks the heading. */
/** Why the sheet opened: a refusal, a look at the plans, or Settings → Manage. */
export type PaywallReason = "exhausted" | "browse" | "manage"

type PaywallApi = {
  cycle: AiCycle
  entitlement: Entitlement | null
  open: (reason: PaywallReason) => void
}

const PaywallContext = React.createContext<PaywallApi | null>(null)
const CycleContext = React.createContext<SubscriptionState | null>(null)

/** The plan state and opener, or null while billing is off or loading. */
export function usePaywall(): PaywallApi | null {
  return React.useContext(PaywallContext)
}

/** The live AI cycle, whether or not billing is switched on; null while loading. */
export function useAiCycleState(): SubscriptionState | null {
  return React.useContext(CycleContext)
}

export function PaywallProvider({ children }: { children: React.ReactNode }) {
  const [billing] = React.useState(billingSwitch)
  const uid = useIdentity()
  const state = useSubscriptionState(uid)
  const [reason, setReason] = React.useState<PaywallReason | null>(null)
  const [noticeOpen, setNoticeOpen] = React.useState(billing.showNotice)
  const api = React.useMemo<PaywallApi | null>(
    () =>
      billing.enabled && state
        ? {
            cycle: state.cycle,
            entitlement: state.entitlement,
            open: setReason,
          }
        : null,
    [billing.enabled, state]
  )

  // One tree shape whether or not the plans are on: `children` must keep the
  // same place in it. Wrapping them in an extra provider only once the plan
  // and the fill count had loaded made React unmount and remount the whole
  // main screen about a second into every launch: the wordmark intro played
  // twice and it looked like the app had reloaded. The sheets are siblings
  // after `children`, so adding them leaves the screen where it is.
  return (
    <CycleContext.Provider value={state}>
      <PaywallContext.Provider value={api}>
        {children}
        {api && (
          <>
            <PaywallSheet
              cycle={api.cycle}
              entitlement={api.entitlement}
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
          </>
        )}
      </PaywallContext.Provider>
    </CycleContext.Provider>
  )
}

// The sheets' AI mark turns the way a fill's does while it estimates, at a
// third of the pace: a calm sign of what the plans are about, not a wait.
const HEADER_SPIN = 0.35

// How long the sheet waits for Paddle's overlay to report it has drawn.
const CHECKOUT_WAIT_MS = 12_000

function PaywallSheet({
  cycle,
  entitlement,
  reason,
  onOpenChange,
}: {
  cycle: AiCycle
  entitlement: Entitlement | null
  reason: PaywallReason | null
  onOpenChange: (open: boolean) => void
}) {
  const { t, n, language } = useI18n()
  const user = useAuthUser()
  const guest = user === null || user.isAnonymous
  const paying =
    entitlement !== null &&
    entitlement.plan !== "free" &&
    isEntitling(entitlement.status)
  // Where the toggle and the selection start each time the sheet opens: a
  // subscriber on their own plan and period (a Pro out of fills on
  // Unlimited, the way up), everyone else on Pro, monthly.
  const startBilling: Billing = (paying && entitlement.billing) || "monthly"
  const startPlan: PaidPlan = paying
    ? reason === "exhausted" && entitlement.plan === "pro"
      ? "unlimited"
      : (entitlement.plan as PaidPlan)
    : "pro"
  const [billing, setBilling] = React.useState<Billing>(startBilling)
  const [chosen, setChosen] = React.useState<PaidPlan>(startPlan)
  const [busy, setBusy] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  // The sheet stays mounted between openings; start fresh on each one.
  // State-adjust-during-render, so the first open frame is already right.
  const open = reason !== null
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setBilling(startBilling)
      setChosen(startPlan)
      setProblem(null)
    }
  }
  // A subscriber's own plan and period: selecting it again changes nothing.
  const isCurrent = (plan: PaidPlan, period: Billing) =>
    paying
      ? plan === entitlement.plan && period === entitlement.billing
      : plan === cycle.plan
  const same = isCurrent(chosen, billing)

  // What switching would charge or credit now, from Paddle, shown under the
  // button before the subscriber confirms. Keyed to the selection, so a
  // stale answer never shows against a newer choice.
  const previewKey = `${chosen}/${billing}`
  const [preview, setPreview] = React.useState<{
    key: string
    value: ChangePreview | null
  } | null>(null)
  const wantsPreview = open && paying && !same && !guest && paddleConfigured()
  React.useEffect(() => {
    if (!wantsPreview) return
    let live = true
    previewChange(chosen, billing)
      .then((value) => live && setPreview({ key: previewKey, value }))
      .catch((err: unknown) => {
        console.error("Plan change preview failed", err)
        if (live) setPreview({ key: previewKey, value: null })
      })
    return () => {
      live = false
    }
  }, [wantsPreview, chosen, billing, previewKey])
  const shown = preview?.key === previewKey ? preview.value : null
  const previewText =
    shown && shown.amount > 0 && shown.action
      ? (shown.action === "charge" ? t.paywall.chargeNow : t.paywall.creditNow)(
          formatPrice(shown.amount / 100, language, shown.currency)
        )
      : null

  const proceed = async () => {
    if (user === null || busy) return
    if (guest) {
      void startGoogleSignIn(auth)
      return
    }
    if (!paddleConfigured()) {
      setProblem(t.paywall.checkoutStub)
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      if (paying) {
        await changePlan(chosen, billing)
        onOpenChange(false)
      } else {
        // Open Paddle's overlay over this sheet and keep the button's spinner
        // going until it has drawn (loading it takes a second or two). Only
        // then close the sheet: the modal sheet makes the page inert, which
        // would swallow taps on the overlay. Should Paddle never say so, the
        // sheet still steps aside after a while.
        await new Promise<void>((resolve, reject) => {
          const fallback = window.setTimeout(resolve, CHECKOUT_WAIT_MS)
          const done = () => {
            window.clearTimeout(fallback)
            resolve()
          }
          openCheckout({
            plan: chosen,
            billing,
            uid: user.uid,
            email: user.email,
            language,
            dark: document.documentElement.classList.contains("dark"),
            onLoaded: done,
            // Paddle shows its own message in the overlay; get out of its way.
            onError: done,
          }).catch((err: unknown) => {
            window.clearTimeout(fallback)
            reject(err)
          })
        })
        onOpenChange(false)
      }
    } catch (err) {
      console.error("Checkout failed", err)
      setProblem(t.paywall.billingError)
    } finally {
      setBusy(false)
    }
  }

  const date = formatShortDate(cycle.resetsOn, language)
  const { title, body } = heading(t, n, cycle, reason ?? "browse", date)
  const planName: Record<Plan, string> = {
    free: t.paywall.planFree,
    pro: t.paywall.planPro,
    unlimited: t.paywall.planUnlimited,
  }

  return (
    <BottomSheet
      open={reason !== null}
      onOpenChange={(open) => {
        if (!open) setProblem(null)
        onOpenChange(open)
      }}
    >
      <BottomSheetContent className="max-h-[92svh] gap-5 overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
            <AiSparkle solid spinning speed={HEADER_SPIN} className="h-5 w-5" />
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
              current={isCurrent(plan, billing)}
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
            disabled={user === null || same}
            aria-busy={busy}
            onClick={() => void proceed()}
          >
            {/* The label and the spinner share one cell and cross-fade, so
                the button keeps its size and nothing jumps. */}
            <span className="grid place-items-center">
              <span
                className={cn(
                  "col-start-1 row-start-1 transition-opacity duration-200",
                  busy && "opacity-0"
                )}
              >
                {paying
                  ? same
                    ? t.paywall.currentPlan
                    : t.paywall.switchTo(planName[chosen])
                  : t.paywall.continueWith(planName[chosen])}
              </span>
              <Spinner
                className={cn(
                  "col-start-1 row-start-1 opacity-0 transition-opacity duration-200",
                  busy && "opacity-90"
                )}
              />
            </span>
          </Button>
          {/* A subscriber sees what the switch costs before confirming. The
              line keeps its room whenever the sheet is theirs, so the sheet
              never changes height as they pick or the answer loads. */}
          {paying && (
            <p
              className={cn(
                "min-h-[2lh] px-2 text-center text-[13px] leading-snug text-muted-foreground transition-opacity duration-200",
                previewText && !same ? "opacity-100" : "opacity-0"
              )}
            >
              {previewText}
            </p>
          )}
          {problem && (
            <p className="text-center text-[13px] text-muted-foreground">
              {problem}
            </p>
          )}
          {/* Card, invoices and cancelling stay in Paddle's portal, one tap
              away and in plain sight: cancelling should be as easy as
              signing up. */}
          {paying && (
            <Button
              variant="ghost"
              size="lg"
              className="h-11 w-full text-[14px] text-muted-foreground"
              onClick={() => {
                setProblem(null)
                openExternal(portalLink).catch((err: unknown) => {
                  console.error("Customer portal failed", err)
                  setProblem(t.paywall.billingError)
                })
              }}
            >
              {t.paywall.manageBilling}
            </Button>
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

// Monthly | Yearly, monthly first and chosen by default (the owner's call,
// Nov 2026, replacing #60's annual-first toggle; yearly cards still lead with
// the per-month figure). The shared Segmented, so its pill slides. The saving
// rides on the yearly segment as a quiet "up to" tag: the best of the two
// plans' savings, so it holds whichever is picked.
function BillingToggle({
  value,
  onChange,
}: {
  value: Billing
  onChange: (value: Billing) => void
}) {
  const { t, n } = useI18n()
  return (
    <Segmented<Billing>
      value={value}
      onChange={onChange}
      ariaLabel={t.paywall.billing}
      size="md"
      options={[
        { value: "monthly", label: t.paywall.billingMonthly },
        {
          value: "annual",
          label: t.paywall.billingAnnual,
          tag: t.paywall.save(
            n(Math.max(annualSavingPct("pro"), annualSavingPct("unlimited")))
          ),
        },
      ]}
    />
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
  const headline = t.paywall.perMonth(
    money(billing === "annual" ? perMonth(price.annual) : price.monthly)
  )
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
        onClick={onSelect}
        whileTap={{ scale: 0.98 }}
        className={cn("flex w-full items-center gap-3 px-4 py-3.5 text-left")}
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
        {/* The figures cross-fade when the period changes, so the switch
            reads as one movement rather than a jump. */}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={billing}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="shrink-0 text-right"
          >
            <div className="text-[15px] font-bold tabular-nums">{headline}</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {sub}
            </div>
          </motion.div>
        </AnimatePresence>
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
          <AiSparkle solid spinning speed={HEADER_SPIN} className="h-5 w-5" />
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

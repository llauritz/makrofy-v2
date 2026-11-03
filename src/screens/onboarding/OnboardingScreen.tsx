import * as React from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  BookText,
  Calculator,
  ChevronLeft,
  Minus,
  PencilLine,
  Plus,
} from "lucide-react"

import { AiSparkle } from "@/components/AiSparkle"
import { LegalLinks } from "@/components/LegalLinks"
import { Spinner } from "@/components/ui/spinner"
import { Squircle } from "@/components/ui/squircle"
import { DEFAULT_GOAL_KCAL } from "@/data/goal"
import { startGoogleSignIn } from "@/data/identity"
import { auth } from "@/lib/firebase"
import { clampGoalKcal, parseGoalKcal } from "@/lib/goal-input"
import { useI18n } from "@/lib/i18n/useI18n"
import { cn } from "@/lib/utils"
import { FADE_IN, FADE_OUT } from "@/screens/main/anim"
import { AddCard } from "@/screens/main/AddCard"
import { AnimatedWordmark } from "@/screens/main/AnimatedWordmark"
import { NeedSheet } from "./NeedSheet"

// First run (#35): two steps. Welcome opens with the app's animated wordmark
// and says what the app does, with the real add card as the example; Goal sets the daily kcal
// target, optionally from the daily-need calculator. Only "Start tracking"
// writes anything (the Goal), and the gate in ./gate.ts then switches the app
// to the main screen. A returning user on a new device signs in from Welcome
// instead; their synced Goal arriving does the same switch.

const STEP = 50

type Step = "welcome" | "goal"

export function OnboardingScreen({
  onSubmit,
}: {
  onSubmit: (kcal: number) => void
}) {
  const [step, setStep] = React.useState<Step>("welcome")
  // Lives here, not in the goal step, so stepping back keeps the figure.
  const [kcal, setKcal] = React.useState(DEFAULT_GOAL_KCAL)

  return (
    // Step swap is a fade-through: out fast, in calmly (spec § Motion).
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={step}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: FADE_IN }}
        exit={{ opacity: 0, transition: FADE_OUT }}
      >
        {step === "welcome" ? (
          <WelcomeStep onNext={() => setStep("goal")} />
        ) : (
          <GoalStep
            kcal={kcal}
            onChange={setKcal}
            onBack={() => setStep("welcome")}
            onSubmit={() => onSubmit(kcal)}
          />
        )}
      </motion.div>
    </AnimatePresence>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col px-7 pt-[max(3.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  )
}

function StepDots({ active }: { active: 0 | 1 }) {
  return (
    <div className="flex justify-center gap-1.5" aria-hidden>
      {[0, 1].map((i) => (
        <span
          key={i}
          className={
            "h-1.5 rounded-full transition-[width,background-color] " +
            (i === active ? "w-[18px] bg-foreground" : "w-1.5 bg-border")
          }
        />
      ))}
    </div>
  )
}

function PrimaryButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Squircle asChild pill>
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.98 }}
        className="w-full rounded-full bg-primary py-3.5 text-[15px] font-semibold text-primary-foreground"
      >
        {children}
      </motion.button>
    </Squircle>
  )
}

// The secondary action under PrimaryButton: the same pill and type, drawn
// as an outline (the squircle strokes its own path) instead of filled. Its
// 1px border box takes 1px off each side of the padding, so the two match.
function OutlineButton({
  onClick,
  busy = false,
  children,
}: {
  onClick: () => void
  /** Swaps the label for a spinner, keeping the button's size. */
  busy?: boolean
  children: React.ReactNode
}) {
  return (
    <Squircle asChild pill outline="solid">
      <motion.button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-busy={busy}
        whileTap={busy ? undefined : { scale: 0.98 }}
        className="w-full rounded-full py-[13px] text-[15px] font-semibold transition-colors hover:bg-muted disabled:hover:bg-transparent"
      >
        {/* The label and the spinner share one cell and cross-fade, as on
            the paywall's button, so nothing jumps. */}
        <span className="grid place-items-center">
          <span
            className={cn(
              "col-start-1 row-start-1 transition-opacity duration-200",
              busy && "opacity-0"
            )}
          >
            {children}
          </span>
          <Spinner
            className={cn(
              "col-start-1 row-start-1 opacity-0 transition-opacity duration-200",
              busy && "opacity-90"
            )}
          />
        </span>
      </motion.button>
    </Squircle>
  )
}

// Leaving for Google can take a second, so the sign-in button shows a
// spinner from the tap until the page goes. It resets if the redirect fails,
// and when the browser brings this page back from its back/forward cache
// (the user pressed Back on Google's page), where it would otherwise still
// be spinning.
function useSignInBusy() {
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false)
    }
    window.addEventListener("pageshow", onShow)
    return () => window.removeEventListener("pageshow", onShow)
  }, [])
  const start = () => {
    if (busy) return
    setBusy(true)
    startGoogleSignIn(auth).catch((err: unknown) => {
      console.error("Google sign-in did not start", err)
      setBusy(false)
    })
  }
  return [busy, start] as const
}

// The AI point wears the app's own AI mark, as the add card above it does:
// solid, to match the strength of the line icons beside it, and a touch
// smaller than them, since a filled star reads heavier than an outline.
function AiPointIcon() {
  return <AiSparkle solid className="h-4 w-4" />
}

const POINT_ICONS = [PencilLine, AiPointIcon, BookText] as const

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const [signingIn, signIn] = useSignInBusy()
  const { t } = useI18n()
  return (
    <Page>
      <AnimatedWordmark height={40} />
      <h1 className="mt-5 text-2xl leading-[1.2] font-medium text-balance">
        {t.onboarding.headline}
      </h1>

      {/* The real add card, filled and inert. -mx-7 cancels the page's px-7,
          so the card keeps its own mx-4 inset from the screen edge, as on
          the main screen: its fields line up with the copy and its 12 px
          padding hangs out past it. */}
      <div
        role="img"
        aria-label={t.onboarding.exampleAria}
        className="-mx-7 mt-7"
      >
        <AddCard
          onAdd={() => {}}
          demo={{
            label: t.onboarding.exampleLabel,
            kcal: "120",
            macros: { p: "5", f: "10", c: "" },
          }}
        />
      </div>

      {/* auto-rows-fr: every point is as tall as the tallest, so the icons
          sit at an even rhythm whatever the line count. */}
      <ul className="mt-8 grid auto-rows-fr gap-5">
        {t.onboarding.points.map((point, i) => {
          const Icon = POINT_ICONS[i]
          return (
            <li key={point.title} className="flex items-start gap-4">
              <Squircle
                pill
                outline="solid"
                className="flex h-11 w-11 shrink-0 items-center justify-center bg-card"
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </Squircle>
              <div className="pt-0.5">
                <div className="text-[15px] font-semibold">{point.title}</div>
                <div className="mt-0.5 text-sm leading-snug text-muted-foreground">
                  {point.body}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto pt-10">
        <StepDots active={0} />
        <div className="mt-4">
          <PrimaryButton onClick={onNext}>
            {t.onboarding.getStarted}
          </PrimaryButton>
        </div>
        {/* The same wording as the Settings sign-in row. It links onto this
            Guest (ADR 0002); a returning user's synced Goal then arrives
            and the gate moves on to the main screen. */}
        <div className="mt-3">
          <OutlineButton busy={signingIn} onClick={signIn}>
            {t.signIn.signInWithGoogle}
          </OutlineButton>
        </div>
        <LegalLinks className="mt-5" pricing={false} />
      </div>
    </Page>
  )
}

function GoalStep({
  kcal,
  onChange,
  onBack,
  onSubmit,
}: {
  kcal: number
  onChange: (kcal: number) => void
  onBack: () => void
  onSubmit: () => void
}) {
  const { t, n } = useI18n()
  const [needOpen, setNeedOpen] = React.useState(false)
  // While typing, the field holds the typed digits, still shown grouped so
  // focusing doesn't change how the number looks.
  const [draft, setDraft] = React.useState<string | null>(null)

  const commitDraft = () => {
    if (draft !== null) onChange(parseGoalKcal(draft) ?? kcal)
    setDraft(null)
  }
  const nudge = (delta: number) => {
    setDraft(null)
    onChange(clampGoalKcal(Math.round((kcal + delta) / STEP) * STEP))
  }

  return (
    <Page>
      <button
        type="button"
        onClick={onBack}
        aria-label={t.onboarding.back}
        className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h1 className="mt-5 text-[28px] leading-[1.15] font-bold tracking-tight">
        {t.onboarding.goalTitle}
      </h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        {t.onboarding.goalSubtitle}
      </p>

      {/* The field and the calculator sit in the free space between the
          heading and the button, a little above its middle, rather than
          straight under the heading. */}
      <div className="flex flex-1 flex-col justify-center pt-10 pb-16">
        <GoalField
          value={
            draft === null ? n(kcal) : draft === "" ? "" : n(Number(draft))
          }
          unit={t.units.kcal}
          ariaLabel={t.onboarding.dailyGoalAria}
          decrease={
            <Stepper
              label={t.onboarding.decrease(STEP)}
              onClick={() => nudge(-STEP)}
            >
              <Minus className="h-[18px] w-[18px]" />
            </Stepper>
          }
          increase={
            <Stepper
              label={t.onboarding.increase(STEP)}
              onClick={() => nudge(STEP)}
            >
              <Plus className="h-[18px] w-[18px]" />
            </Stepper>
          }
          onChange={(digits) => setDraft(digits.slice(0, 5))}
          onFocus={() => setDraft(String(kcal))}
          onBlur={commitDraft}
        />

        <div className="mt-10 flex flex-col items-center">
          <Squircle asChild pill outline="solid">
            <button
              type="button"
              onClick={() => setNeedOpen(true)}
              className="flex items-center gap-2 bg-card px-5 py-3 text-sm font-semibold transition-colors hover:bg-muted"
            >
              <Calculator className="h-4 w-4" aria-hidden />
              {t.onboarding.calculate}
            </button>
          </Squircle>
        </div>
      </div>

      <div className="pt-10">
        <StepDots active={1} />
        {/* mb-12 matches the sign-in line under Welcome's button, so the button
            stays put across the two steps. */}
        <div className="mt-4 mb-12">
          <PrimaryButton onClick={onSubmit}>
            {t.onboarding.startTracking}
          </PrimaryButton>
        </div>
      </div>

      <NeedSheet
        open={needOpen}
        onOpenChange={setNeedOpen}
        onPick={(next) => {
          setDraft(null)
          onChange(next)
        }}
      />
    </Page>
  )
}

// The goal figure and its unit sit in a faint field, the app's input surface,
// with the steppers centred on it either side. The whole field is a <label>,
// so a tap anywhere on it lands in the input.
function GoalField({
  value,
  unit,
  ariaLabel,
  decrease,
  increase,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string
  unit: string
  ariaLabel: string
  decrease: React.ReactNode
  increase: React.ReactNode
  /** The field's digits, without grouping. */
  onChange: (digits: string) => void
  onFocus: () => void
  onBlur: () => void
}) {
  const id = React.useId()
  const ref = React.useRef<HTMLInputElement>(null)
  // The figure is regrouped on every keystroke ("950" + "1" shows "1,950"),
  // and a controlled input whose text changes under it puts the caret at the
  // end. So the caret is kept as a count of the digits before it, and put
  // back after that many digits of the new text.
  const caretDigits = React.useRef<number | null>(null)
  const placeCaret = React.useCallback(() => {
    const el = ref.current
    const count = caretDigits.current
    if (!el || count === null || document.activeElement !== el) return
    caretDigits.current = null
    let at = 0
    for (let seen = 0; at < el.value.length && seen < count; at++)
      if (/\d/.test(el.value[at])) seen++
    el.setSelectionRange(at, at)
  }, [])
  // A typed digit lands before the copy under the input has widened it, so
  // the browser scrolls the text to keep the caret in view and the first
  // digit slips out of sight. The input is as wide as its text again by
  // layout, so scroll it back before the frame paints.
  React.useLayoutEffect(() => {
    if (ref.current) ref.current.scrollLeft = 0
    placeCaret()
  }, [value, placeCaret])

  const change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    const caret = e.target.selectionStart ?? text.length
    let digits = text.replace(/\D/g, "")
    let before = text.slice(0, caret).replace(/\D/g, "").length
    const shown = value.replace(/\D/g, "")
    // Backspace over a group separator deletes the digit before it, as in
    // any grouped number field, rather than doing nothing.
    if (digits === shown && text.length < value.length && before > 0) {
      digits = digits.slice(0, before - 1) + digits.slice(before)
      before -= 1
    }
    caretDigits.current = before
    onChange(digits)
    // Unchanged digits (a letter typed) mean no re-render to place the
    // caret after React puts the old text back, so place it next frame.
    if (digits === shown) requestAnimationFrame(placeCaret)
  }
  const input = (
    <input
      ref={ref}
      id={id}
      value={value}
      onChange={change}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
      }}
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel}
      // Without it the input's intrinsic width (20 characters) would size
      // the grid cell instead of the copy.
      size={1}
      className="col-start-1 row-start-1 w-full min-w-0 bg-transparent text-center outline-none"
    />
  )

  return (
    <div className="flex items-center justify-center gap-3">
      {decrease}
      <Squircle asChild radius="2xl">
        <label
          htmlFor={id}
          className="flex h-[4.5rem] min-w-48 shrink-0 cursor-text items-center justify-center bg-input px-3"
        >
          <span className="flex items-baseline gap-1.5">
            {/* The input sizes to its text through an invisible copy
                under it, so the unit follows the figure. */}
            <span
              className={cn(
                "inline-grid leading-none font-bold tracking-tight tabular-nums",
                // Five digits at full size would push the steppers off a
                // 360px screen; goals that big are rare, so they step down.
                value.replace(/\D/g, "").length > 4
                  ? "text-[36px]"
                  : "text-[44px]"
              )}
            >
              <span
                aria-hidden
                className="invisible col-start-1 row-start-1 min-w-[1ch] whitespace-pre"
              >
                {value}
              </span>
              {input}
            </span>
            <span className="text-[15px] font-semibold text-muted-foreground">
              {unit}
            </span>
          </span>
        </label>
      </Squircle>
      {increase}
    </div>
  )
}

function Stepper({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Squircle asChild pill outline="solid">
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.92 }}
        aria-label={label}
        className="flex h-11 w-11 shrink-0 items-center justify-center bg-card"
      >
        {children}
      </motion.button>
    </Squircle>
  )
}

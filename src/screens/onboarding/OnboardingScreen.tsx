import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  BookText,
  Calculator,
  ChevronLeft,
  Minus,
  PencilLine,
  Plus,
  Sparkles,
} from "lucide-react"

import { Squircle } from "@/components/ui/squircle"
import { DEFAULT_GOAL_KCAL } from "@/data/goal"
import { startGoogleSignIn } from "@/data/identity"
import { auth } from "@/lib/firebase"
import { clampGoalKcal, parseGoalKcal } from "@/lib/goal-input"
import { useI18n } from "@/lib/i18n/useI18n"
import { FADE_IN, FADE_OUT } from "@/screens/main/anim"
import { AddCard } from "@/screens/main/AddCard"
import { IntroPattern } from "./IntroPattern"
import { NeedSheet } from "./NeedSheet"

// First run (#35): an intro animation, then two steps. Welcome says what the
// app does, with the real add card as the example; Goal sets the daily kcal
// target, optionally from the daily-need calculator. Only "Start tracking"
// writes anything (the Goal), and the gate in ./gate.ts then switches the app
// to the main screen. A returning user on a new device signs in from Welcome
// instead; their synced Goal arriving does the same switch.

const STEP = 50

// The intro plays once per browser session, so coming back from the Google
// sign-in redirect (or a reload mid-onboarding) doesn't replay it.
const INTRO_SEEN_KEY = "yaffle.introSeen"

function introSeen(): boolean {
  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) === "1"
  } catch {
    return false
  }
}

function markIntroSeen() {
  try {
    sessionStorage.setItem(INTRO_SEEN_KEY, "1")
  } catch {
    // Best-effort: worst case the intro plays again.
  }
}

type Step = "welcome" | "goal"

export function OnboardingScreen({
  onSubmit,
}: {
  onSubmit: (kcal: number) => void
}) {
  const reducedMotion = useReducedMotion()
  const [intro, setIntro] = React.useState(() => !introSeen())
  const [step, setStep] = React.useState<Step>("welcome")
  // Lives here, not in the goal step, so stepping back keeps the figure.
  const [kcal, setKcal] = React.useState(DEFAULT_GOAL_KCAL)

  const finishIntro = React.useCallback(() => {
    markIntroSeen()
    setIntro(false)
  }, [])

  return (
    <>
      {/* Step swap is a fade-through: out fast, in calmly (spec § Motion). */}
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
      {intro && !reducedMotion && <IntroPattern onDone={finishIntro} />}
    </>
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

const POINT_ICONS = [PencilLine, Sparkles, BookText] as const

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const { t } = useI18n()
  return (
    <Page>
      <div className="font-wordmark text-[40px] leading-none font-semibold">
        {t.app.name}
      </div>
      <h1 className="mt-5 text-[28px] leading-[1.15] font-bold tracking-tight text-balance">
        {t.onboarding.headline}
      </h1>

      {/* The real add card, filled and inert; -mx-4 cancels the card's own
          mx-4 so its edges line up with the copy. */}
      <div
        role="img"
        aria-label={t.onboarding.exampleAria}
        className="-mx-4 mt-7"
      >
        <AddCard
          onAdd={() => {}}
          demo={{
            label: t.onboarding.exampleLabel,
            kcal: "120",
            macros: { p: "5", f: "10", c: "4" },
          }}
        />
      </div>

      <ul className="mt-8 flex flex-col gap-5">
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
        <p className="mt-1 py-3 text-center text-sm text-muted-foreground">
          {t.onboarding.haveAccount}{" "}
          <button
            type="button"
            onClick={() => void startGoogleSignIn(auth)}
            className="font-semibold text-foreground underline-offset-4 hover:underline"
          >
            {t.onboarding.signIn}
          </button>
        </p>
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
  // While typing, the field shows the raw draft; otherwise the formatted goal.
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

      <div className="mt-14 flex items-center justify-center gap-5">
        <Stepper
          label={t.onboarding.decrease(STEP)}
          onClick={() => nudge(-STEP)}
        >
          <Minus className="h-[18px] w-[18px]" />
        </Stepper>
        <div className="flex w-40 flex-col items-center">
          <input
            value={draft ?? n(kcal)}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => {
              setDraft(String(kcal))
              requestAnimationFrame(() => e.target.select())
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
            }}
            inputMode="numeric"
            autoComplete="off"
            aria-label={t.onboarding.dailyGoalAria}
            className="w-full bg-transparent text-center text-[44px] leading-tight font-bold tracking-tight tabular-nums outline-none"
          />
          <span className="text-sm font-medium text-muted-foreground">
            {t.units.kcal}
          </span>
        </div>
        <Stepper
          label={t.onboarding.increase(STEP)}
          onClick={() => nudge(STEP)}
        >
          <Plus className="h-[18px] w-[18px]" />
        </Stepper>
      </div>

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
        <p className="mt-3 text-[13px] text-muted-foreground">
          {t.onboarding.calculateNote}
        </p>
      </div>

      <div className="mt-auto pt-10">
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

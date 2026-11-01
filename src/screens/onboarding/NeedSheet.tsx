import * as React from "react"
import { AnimatePresence, motion } from "motion/react"

import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet"
import { Segmented } from "@/components/ui/segmented"
import { Squircle } from "@/components/ui/squircle"
import {
  defaultPaceIndex,
  LIMITS,
  maintenanceKcal,
  paceOptions,
  parseInRange,
  type Activity,
  type Aim,
  type Body,
  type Sex,
} from "@/lib/daily-need"
import { useI18n } from "@/lib/i18n/useI18n"
import { cn } from "@/lib/utils"
import { FADE_IN, FADE_OUT } from "@/screens/main/anim"

// "Calculate my daily need" (#35): a short form, then a result to pick from.
// The details stay in this sheet's memory only. Nothing here is written
// anywhere; choosing a result hands one kcal figure back to the goal step,
// which still waits for "Start tracking" to commit it.

interface Form {
  sex: Sex | null
  age: string
  height: string
  weight: string
  activity: Activity | null
  aim: Aim | null
}

const EMPTY_FORM: Form = {
  sex: null,
  age: "",
  height: "",
  weight: "",
  activity: null,
  aim: null,
}

export function NeedSheet({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (kcal: number) => void
}) {
  const { t } = useI18n()
  const [form, setForm] = React.useState<Form>(EMPTY_FORM)
  // The body and aim the result was calculated from; null shows the form.
  const [result, setResult] = React.useState<{ body: Body; aim: Aim } | null>(
    null
  )

  const body = bodyFrom(form)
  const ready = body !== null && form.aim !== null

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="max-h-[92svh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <BottomSheetTitle className="text-lg font-semibold">
            {t.onboarding.needTitle}
          </BottomSheetTitle>
          <BottomSheetClose />
        </div>

        {/* Form ⇄ result is a fade-through in place (spec § Motion). */}
        <AnimatePresence mode="wait" initial={false}>
          {result === null ? (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: FADE_IN }}
              exit={{ opacity: 0, transition: FADE_OUT }}
            >
              <NeedForm form={form} onChange={setForm} />
              <Squircle asChild pill>
                <button
                  type="button"
                  disabled={!ready}
                  onClick={() =>
                    body && form.aim && setResult({ body, aim: form.aim })
                  }
                  className="mt-6 w-full rounded-full bg-primary py-3.5 text-[15px] font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
                >
                  {t.onboarding.calculateButton}
                </button>
              </Squircle>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: FADE_IN }}
              exit={{ opacity: 0, transition: FADE_OUT }}
            >
              <NeedResult
                body={result.body}
                aim={result.aim}
                onUse={(kcal) => {
                  onPick(kcal)
                  onOpenChange(false)
                }}
                onEdit={() => setResult(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </BottomSheetContent>
    </BottomSheet>
  )
}

function NeedForm({
  form,
  onChange,
}: {
  form: Form
  onChange: (form: Form) => void
}) {
  const { t } = useI18n()
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    onChange({ ...form, [key]: value })

  return (
    <div className="flex flex-col">
      <Label>{t.onboarding.sex}</Label>
      <Segmented<Sex>
        size="md"
        ariaLabel={t.onboarding.sex}
        value={form.sex}
        onChange={(v) => set("sex", v)}
        options={[
          { value: "female", label: t.onboarding.female },
          { value: "male", label: t.onboarding.male },
          { value: "other", label: t.onboarding.otherSex },
        ]}
      />

      <div className="mt-4 grid grid-cols-3 gap-2">
        <NumberField
          label={t.onboarding.age}
          unit={t.onboarding.years}
          value={form.age}
          onChange={(v) => set("age", v)}
        />
        <NumberField
          label={t.onboarding.height}
          unit={t.onboarding.cm}
          value={form.height}
          onChange={(v) => set("height", v)}
        />
        <NumberField
          label={t.onboarding.weight}
          unit={t.onboarding.kg}
          value={form.weight}
          onChange={(v) => set("weight", v)}
          decimal
        />
      </div>

      <Label>{t.onboarding.activity}</Label>
      <Segmented<Activity>
        size="md"
        ariaLabel={t.onboarding.activity}
        value={form.activity}
        onChange={(v) => set("activity", v)}
        options={[
          { value: "low", label: t.onboarding.activityLow },
          { value: "moderate", label: t.onboarding.activityModerate },
          { value: "high", label: t.onboarding.activityHigh },
        ]}
      />

      <Label>{t.onboarding.aim}</Label>
      <Segmented<Aim>
        size="md"
        ariaLabel={t.onboarding.aim}
        value={form.aim}
        onChange={(v) => set("aim", v)}
        options={[
          { value: "lose", label: t.onboarding.lose },
          { value: "maintain", label: t.onboarding.maintain },
          { value: "gain", label: t.onboarding.gain },
        ]}
      />
    </div>
  )
}

function NeedResult({
  body,
  aim,
  onUse,
  onEdit,
}: {
  body: Body
  aim: Aim
  onUse: (kcal: number) => void
  onEdit: () => void
}) {
  const { t, n } = useI18n()
  const maintenance = maintenanceKcal(body)
  const options = paceOptions(maintenance, aim)
  const [picked, setPicked] = React.useState(() => defaultPaceIndex(options))
  const choice = options[Math.min(picked, options.length - 1)]

  return (
    <div className="flex flex-col">
      <p className="mt-3 text-[15px] leading-relaxed font-medium">
        {t.onboarding.maintenance(
          n(paceOptions(maintenance, "maintain")[0].kcal)
        )}
      </p>

      {aim !== "maintain" && (
        <>
          <Label>{t.onboarding.howFast}</Label>
          <div
            role="radiogroup"
            aria-label={t.onboarding.howFast}
            className="flex flex-col gap-2"
          >
            {options.map((option, i) => {
              const active = i === picked
              return (
                <Squircle
                  key={option.kgPerWeek}
                  asChild
                  radius="2xl"
                  outline="solid"
                  outlineClassName={active ? "text-foreground" : "text-border"}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPicked(i)}
                    className="flex items-center gap-3 px-4 py-3.5 text-left"
                  >
                    <span
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] border-border transition-[border]",
                        active && "border-[5px] border-foreground"
                      )}
                    />
                    <span className="flex-1 text-[15px]">
                      {aim === "lose"
                        ? t.onboarding.losePace(n(option.kgPerWeek))
                        : t.onboarding.gainPace(n(option.kgPerWeek))}
                    </span>
                    <span className="text-[15px] font-semibold tabular-nums">
                      {n(option.kcal)}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {t.units.kcal}
                      </span>
                    </span>
                  </button>
                </Squircle>
              )
            })}
          </div>
        </>
      )}

      <p className="mt-4 text-center text-[13px] text-muted-foreground">
        {t.onboarding.estimateNote}
      </p>
      <Squircle asChild pill>
        <button
          type="button"
          onClick={() => onUse(choice.kcal)}
          className="mt-3 w-full rounded-full bg-primary py-3.5 text-[15px] font-semibold text-primary-foreground"
        >
          {t.onboarding.useGoal(n(choice.kcal))}
        </button>
      </Squircle>
      <button
        type="button"
        onClick={onEdit}
        className="mt-1 self-center py-2.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {t.onboarding.changeDetails}
      </button>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </div>
  )
}

function NumberField({
  label,
  unit,
  value,
  onChange,
  decimal = false,
}: {
  label: string
  unit: string
  value: string
  onChange: (value: string) => void
  decimal?: boolean
}) {
  const id = React.useId()
  return (
    <Squircle asChild radius="xl">
      <label htmlFor={id} className="flex flex-col bg-input px-3 py-2">
        <span className="text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
        <span className="flex items-baseline gap-1">
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            inputMode={decimal ? "decimal" : "numeric"}
            autoComplete="off"
            placeholder="–"
            className="w-full min-w-0 bg-transparent text-lg font-semibold tabular-nums outline-none placeholder:text-[#a5988a]"
          />
          <span className="text-xs text-muted-foreground">{unit}</span>
        </span>
      </label>
    </Squircle>
  )
}

function bodyFrom(form: Form): Body | null {
  const age = parseInRange(form.age, LIMITS.age)
  const heightCm = parseInRange(form.height, LIMITS.heightCm)
  const weightKg = parseInRange(form.weight, LIMITS.weightKg)
  if (
    !form.sex ||
    !form.activity ||
    age === null ||
    heightCm === null ||
    weightKg === null
  ) {
    return null
  }
  return { sex: form.sex, age, heightCm, weightKg, activity: form.activity }
}

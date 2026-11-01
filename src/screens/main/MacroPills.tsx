import * as React from "react"

import type { Entry } from "@/data/entries"
import { useI18n } from "@/lib/i18n/useI18n"
import { MACROS, type Macro } from "./macros"
import { MacroLetter } from "./MacroLetter"
import { Squircle } from "@/components/ui/squircle"

// Every P/F/C pill in the app lives here, so the pill design changes in one
// place and no screen can keep an old copy (the inline editor and the
// glossary's reading editor kept the dot + grey letter after #93). Both kinds
// carry the colored Nunito Black letter (MacroLetter) on a translucent wash of
// the macro's color token:
//   - MacroChips: the read-only gram chips under a food's label (entry rows,
//     suggestions, glossary rates). Only macros actually logged get a chip.
//   - MacroInputPill: the gram inputs of the add card, the inline entry
//     editor and the glossary's reading editor.
// Screens pass a macro and values; they never set the pill's colors, tint or
// letter themselves. tests/macro-pills.test.ts fails on a hand-built copy.

/** A translucent wash of a macro's color, for the pill's background. */
function tint(macro: Macro, percent: number) {
  return `color-mix(in oklab, ${macro.mark} ${percent}%, transparent)`
}

const CHIP_TINT = 13
const INPUT_TINT = 11

type ChipSize = "sm" | "md"

// `md` is the entry-row size; `sm` the denser Suggestion and glossary rows.
const CHIP_SIZE: Record<
  ChipSize,
  { row: string; chip: string; letter: string }
> = {
  md: { row: "mt-1.5", chip: "px-2 py-0.5 text-[11px]", letter: "text-[14px]" },
  sm: { row: "mt-1", chip: "px-1.5 py-0.5 text-[10px]", letter: "text-[13px]" },
}

export function MacroChips({
  nutrients,
  size = "md",
}: {
  nutrients: Pick<Entry, "protein" | "fat" | "carbs">
  size?: ChipSize
}) {
  const { t, n } = useI18n()
  const chips = MACROS.filter((m) => (nutrients[m.field] ?? 0) > 0)
  if (chips.length === 0) return null
  const s = CHIP_SIZE[size]
  return (
    <div className={`flex gap-1.5 ${s.row}`}>
      {chips.map((m) => (
        <Squircle asChild pill key={m.key}>
          <span
            className={`flex items-baseline gap-1 rounded-full font-medium tabular-nums ${s.chip}`}
            style={{ backgroundColor: tint(m, CHIP_TINT) }}
          >
            <MacroLetter macro={m} withGrams className={s.letter} />
            {n(nutrients[m.field] ?? 0)}
            {t.units.g}
          </span>
        </Squircle>
      ))}
    </div>
  )
}

type InputSize = "sm" | "md"

// `md` is the add card and the inline entry editor; `sm` the glossary's
// denser reading editor.
const INPUT_SIZE: Record<InputSize, { pill: string; letter: string }> = {
  md: { pill: "px-3 py-2.5", letter: "text-[15px]" },
  sm: { pill: "px-2.5 py-1.5", letter: "text-[14px]" },
}

export function MacroInputPill({
  macro,
  size = "md",
  className = "",
  ...input
}: {
  macro: Macro
  size?: InputSize
  /** State classes on the pill itself: the AI flag outline, a fill's pulse. */
  className?: string
  value: string
  onChange: React.ChangeEventHandler<HTMLInputElement>
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  onFocus?: React.FocusEventHandler<HTMLInputElement>
  "aria-label": string
}) {
  const { t } = useI18n()
  const s = INPUT_SIZE[size]
  return (
    <Squircle asChild pill>
      <label
        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-full ${s.pill} ${className}`}
        style={{ backgroundColor: tint(macro, INPUT_TINT) }}
      >
        <MacroLetter macro={macro} className={s.letter} />
        <input
          {...input}
          placeholder="0"
          inputMode="decimal"
          className="w-full min-w-0 bg-transparent text-right text-sm tabular-nums outline-none placeholder:text-[#a5988a]"
        />
        <span className="text-xs text-[#a5988a]">{t.units.g}</span>
      </label>
    </Squircle>
  )
}

import { Plus } from "lucide-react"

import { MACROS, macroTint } from "./macros"

// Label + kcal on top, tinted P/F/C gram pills + ink Add below. Visual only:
// inputs and the button do nothing until the manual-entry slice (#15).
// #a5988a (not muted-foreground) for placeholders and the "g" unit in BOTH
// modes is deliberate — it matches the record screenshots (issue #4).
export function AddCard() {
  return (
    <div className="mx-4 mt-1 rounded-3xl border bg-card p-3 shadow-[0_1px_2px_rgba(43,32,21,0.05)]">
      <div className="flex items-center gap-2">
        <input
          placeholder="What did you eat?"
          className="min-w-0 flex-1 rounded-full bg-input px-4 py-2.5 text-sm outline-none placeholder:text-[#a5988a]"
        />
        <input
          placeholder="kcal"
          inputMode="decimal"
          className="w-16 rounded-full bg-input px-3 py-2.5 text-center text-sm tabular-nums outline-none placeholder:text-[#a5988a]"
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        {MACROS.map((m) => (
          <label
            key={m.key}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 py-2"
            style={{ backgroundColor: macroTint(m.mark, 11) }}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: m.mark }}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {m.letter}
            </span>
            <input
              placeholder="0"
              inputMode="decimal"
              aria-label={`${m.label} grams`}
              className="w-full min-w-0 bg-transparent text-right text-sm tabular-nums outline-none placeholder:text-[#a5988a]"
            />
            <span className="text-xs text-[#a5988a]">g</span>
          </label>
        ))}
        <button
          aria-label="Add entry"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}

import type { Entry } from "@/data/entries"
import { MACROS, macroTint } from "./macros"

// The tinted P/F/C gram chips shown under a food's label — shared by the entry
// list rows and the history Suggestion rows (and the Glossary browser to come,
// #37) so a chip tweak lands in one place. Only macros actually logged get a
// chip (spec conventions). `md` is the entry-row size; `sm` the denser
// Suggestion row.
type ChipSize = "sm" | "md"

const SIZE: Record<ChipSize, { row: string; chip: string; dot: string }> = {
  md: { row: "mt-1.5", chip: "px-2 py-0.5 text-[11px]", dot: "h-1.5 w-1.5" },
  sm: { row: "mt-1", chip: "px-1.5 py-0.5 text-[10px]", dot: "h-1 w-1" },
}

export function MacroChips({
  nutrients,
  size = "md",
}: {
  nutrients: Pick<Entry, "protein" | "fat" | "carbs">
  size?: ChipSize
}) {
  const chips = MACROS.filter((m) => (nutrients[m.field] ?? 0) > 0)
  if (chips.length === 0) return null
  const s = SIZE[size]
  return (
    <div className={`flex gap-1.5 ${s.row}`}>
      {chips.map((m) => (
        <span
          key={m.key}
          className={`flex items-center gap-1 rounded-full font-medium tabular-nums ${s.chip}`}
          style={{ backgroundColor: macroTint(m.mark, 13) }}
        >
          <span
            className={`rounded-full ${s.dot}`}
            style={{ backgroundColor: m.mark }}
          />
          {m.letter} {nutrients[m.field]}g
        </span>
      ))}
    </div>
  )
}

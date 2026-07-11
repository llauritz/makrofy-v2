import { MACROS, macroTint } from "./macros"
import type { MockEntry } from "./mock"

// The day's entries. Spec conventions: no entry times, macro chips only for
// macros actually logged, 0-kcal entries dashed with a muted number — where
// "muted" is #a5988a in BOTH modes, per the record screenshots (issue #4).
export function EntryList({ entries }: { entries: MockEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="mx-4 mt-3 rounded-2xl border border-dashed border-[#cbbfa4] px-4 py-8 text-center dark:border-[#4a3e2e]">
        <div className="text-[15px] font-medium">Nothing logged yet</div>
        <div className="mt-1 text-xs text-muted-foreground">
          What you eat today shows up here.
        </div>
      </div>
    )
  }

  return (
    <div className="mx-4 mt-3 flex flex-col gap-2 pb-3">
      {entries.map((e) => {
        const noKcal = e.kcal === 0
        const chips = MACROS.filter((m) => e[m.key] > 0)
        return (
          <div
            key={e.id}
            className={
              "rounded-2xl px-4 py-3 " +
              (noKcal
                ? "border border-dashed border-[#cbbfa4] dark:border-[#4a3e2e]"
                : "border bg-card")
            }
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-medium">
                  {e.label}
                </div>
                {chips.length > 0 && (
                  <div className="mt-1.5 flex gap-1.5">
                    {chips.map((m) => (
                      <span
                        key={m.key}
                        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
                        style={{ backgroundColor: macroTint(m.mark, 13) }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: m.mark }}
                        />
                        {m.letter} {e[m.key]}g
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div
                className={
                  "shrink-0 text-[15px] font-semibold tabular-nums " +
                  (noKcal ? "text-[#a5988a]" : "")
                }
              >
                {e.kcal}
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                  kcal
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

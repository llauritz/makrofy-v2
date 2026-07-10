// PROTOTYPE — Variant B "Market plate", iteration 2 (issue #4).
// User feedback folded in: warm but NEUTRAL — ink ring (no segmented plate), macro
// colors P=blue / F=yellow / C=red (validated light+dark), no entry times, V1 feature
// parity: sync indicator + stats in the header, kcal + P/F/C fields on the add card,
// dashed 0-kcal entry state, summary shows consumed / remaining / % of goal,
// one future day visible in the week strip.
import { BarChart3, CloudOff, Plus, Settings2 } from "lucide-react"

import { ENTRIES, GOAL_KCAL, PCT_OF_GOAL, REMAINING, TOTALS } from "./mock-data"

// Macro order P, F, C (V1's order). light-dark() picks the validated set per mode.
// `color` = mark color (chips, dots); `textColor` = text-grade variant (≥4.5:1 on the card).
const MACROS = [
  {
    key: "p",
    letter: "P",
    label: "Protein",
    grams: TOTALS.p,
    color: "light-dark(#2f6bc4, #5b91e4)",
    textColor: "light-dark(#2f6bc4, #5b91e4)",
  },
  {
    key: "f",
    letter: "F",
    label: "Fat",
    grams: TOTALS.f,
    color: "light-dark(#b8830a, #b98a20)",
    textColor: "light-dark(#96690a, #b98a20)",
  },
  {
    key: "c",
    letter: "C",
    label: "Carbs",
    grams: TOTALS.c,
    color: "light-dark(#c03b2e, #cf6152)",
    textColor: "light-dark(#c03b2e, #e07d6e)",
  },
] as const

const WEEK = [
  { d: "S", n: 5, logged: true },
  { d: "M", n: 6, logged: true },
  { d: "T", n: 7, logged: false },
  { d: "W", n: 8, logged: true },
  { d: "T", n: 9, logged: true },
  { d: "F", n: 10, logged: true, today: true },
  { d: "S", n: 11, future: true },
]

function ProgressRing() {
  // Single-hue meter: ink arc on a lighter warm step — consumed kcal in the center.
  const size = 116
  const c = size / 2
  const r = 46
  const circ = 2 * Math.PI * r
  const consumed = Math.min(1, TOTALS.kcal / GOAL_KCAL)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="light-dark(#efe6d4, #3a2f22)"
          strokeWidth={11}
        />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="light-dark(#2b2015, #f3ece2)"
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={`${circ * consumed} ${circ * (1 - consumed)}`}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xl leading-none font-bold tabular-nums">
          {TOTALS.kcal.toLocaleString()}
        </div>
        <div className="mt-0.5 text-[10px] text-[#7d7060] dark:text-[#a5988a]">
          kcal
        </div>
      </div>
    </div>
  )
}

export function VariantB() {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col bg-[#f6f1e6] text-[#2b2015] dark:bg-[#17110c] dark:text-[#f3ece2]">
      {/* Header — taller, larger wordmark; sync indicator + settings (stats lives in the summary card) */}
      <header className="flex items-center justify-between px-5 pt-7 pb-4">
        <div className="font-['Fraunces_Variable',serif] text-[30px] leading-none font-semibold">
          Makrofy
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Sync status: not synced"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#7d7060] dark:text-[#a5988a]"
          >
            <CloudOff className="h-[18px] w-[18px]" />
          </button>
          <button
            aria-label="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e6dcc8] bg-[#fffdf7] text-[#7d7060] dark:border-[#3a2f22] dark:bg-[#2a211a] dark:text-[#a5988a]"
          >
            <Settings2 className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      {/* Week strip — ends with one visible future day, visually marked */}
      <div className="flex justify-between px-4 py-2">
        {WEEK.map((day, i) => (
          <button
            key={i}
            className={
              "flex w-11 flex-col items-center gap-0.5 rounded-full py-2 " +
              (day.today
                ? "bg-[#2b2015] text-[#f6f1e6] dark:bg-[#f3ece2] dark:text-[#17110c]"
                : day.future
                  ? "border border-dashed border-[#cbbfa4] text-[#2b2015] opacity-60 dark:border-[#4a3e2e] dark:text-[#f3ece2]"
                  : "text-[#2b2015] dark:text-[#f3ece2]")
            }
          >
            <span
              className={
                "text-[10px] " +
                (day.today
                  ? "opacity-70"
                  : "text-[#7d7060] dark:text-[#a5988a]")
              }
            >
              {day.d}
            </span>
            <span className="text-sm font-semibold tabular-nums">{day.n}</span>
            <span
              className={
                "h-1 w-1 rounded-full " +
                (day.logged
                  ? day.today
                    ? "bg-[#f6f1e6]/70 dark:bg-[#17110c]/70"
                    : "bg-[#b9ab92] dark:bg-[#5a4c3b]"
                  : "bg-transparent")
              }
            />
          </button>
        ))}
      </div>

      {/* Add card — food + kcal, then P/F/C grams (V1 parity) */}
      <div className="mx-4 mt-1 rounded-3xl border border-[#eee5d2] bg-[#fffdf7] p-3 shadow-[0_1px_2px_rgba(43,32,21,0.05)] dark:border-[#3a2f22] dark:bg-[#2a211a]">
        <div className="flex items-center gap-2">
          <input
            placeholder="What did you eat?"
            className="min-w-0 flex-1 rounded-full bg-[#f3ecdd] px-4 py-2.5 text-sm outline-none placeholder:text-[#a5988a] dark:bg-[#211a12]"
          />
          <input
            placeholder="kcal"
            inputMode="decimal"
            className="w-16 rounded-full bg-[#f3ecdd] px-3 py-2.5 text-center text-sm tabular-nums outline-none placeholder:text-[#a5988a] dark:bg-[#211a12]"
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          {MACROS.map((m) => (
            <label
              key={m.key}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 py-2"
              style={{
                backgroundColor: `color-mix(in oklab, ${m.color} 11%, transparent)`,
              }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: m.color }}
              />
              <span className="text-xs font-medium text-[#7d7060] dark:text-[#a5988a]">
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2b2015] text-[#f6f1e6] dark:bg-[#f3ece2] dark:text-[#17110c]"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Entry cards — no times; chips only for macros actually logged;
          dashed card = 0-kcal entry (V1 parity) */}
      <div className="mx-4 mt-3 flex flex-col gap-2 pb-3">
        {ENTRIES.map((e) => {
          const noKcal = e.kcal === 0
          const chips = MACROS.filter((m) => e[m.key] > 0)
          return (
            <div
              key={e.id}
              className={
                "rounded-2xl px-4 py-3 " +
                (noKcal
                  ? "border border-dashed border-[#cbbfa4] dark:border-[#4a3e2e]"
                  : "border border-[#eee5d2] bg-[#fffdf7] dark:border-[#3a2f22] dark:bg-[#2a211a]")
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
                          style={{
                            backgroundColor: `color-mix(in oklab, ${m.color} 13%, transparent)`,
                          }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: m.color }}
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
                  <span className="ml-1 text-[11px] font-normal text-[#7d7060] dark:text-[#a5988a]">
                    kcal
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex-1" />

      {/* Summary — consumed in the ring, remaining + % of goal, macro totals (V1 numbers) */}
      <div className="sticky bottom-0 px-3 pb-3">
        <div className="flex items-center gap-4 rounded-[28px] border border-[#eee5d2] bg-[#fffdf7] p-4 shadow-[0_8px_30px_rgba(43,32,21,0.12)] dark:border-[#3a2f22] dark:bg-[#2a211a] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          <ProgressRing />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg leading-tight font-bold tabular-nums">
                  Remaining: {REMAINING.toLocaleString()}
                </div>
                <div className="mt-0.5 text-xs text-[#7d7060] tabular-nums dark:text-[#a5988a]">
                  {PCT_OF_GOAL}% of {GOAL_KCAL.toLocaleString()} goal
                </div>
              </div>
              <button
                aria-label="Statistics"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3ecdd] text-[#7d7060] dark:bg-[#211a12] dark:text-[#a5988a]"
              >
                <BarChart3 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-[#eee5d2] pt-2.5 dark:border-[#3a2f22]">
              {/* Macro totals — outlined pills, like the entry chips minus the dot */}
              {MACROS.map((m) => (
                <span
                  key={m.key}
                  className="rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap tabular-nums"
                  style={{
                    borderColor: m.color,
                    backgroundColor: `color-mix(in oklab, ${m.color} 8%, transparent)`,
                    color: m.textColor,
                  }}
                >
                  {m.letter} {m.grams}g
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

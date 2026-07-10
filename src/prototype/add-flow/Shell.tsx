/* eslint-disable react-refresh/only-export-components -- prototype: tokens and components share a file on purpose */
// PROTOTYPE — issue #5. The locked "Warm Market" shell (from issue #4, Variant B
// iteration 5), made live: entries and the summary ring recompute from state.
// The add card is per-variant and mounts in the `addCard` slot — the shell
// itself is NOT under evaluation here, only the add flow is.
import { BarChart3, CloudOff, Settings2, Sparkles } from "lucide-react"

export const GOAL_KCAL = 2200

export type MacroKey = "p" | "f" | "c"

// Macro order P, F, C; validated light+dark sets from issue #4.
export const MACROS = [
  {
    key: "p" as MacroKey,
    letter: "P",
    label: "Protein",
    color: "light-dark(#2f6bc4, #5b91e4)",
    textColor: "light-dark(#2f6bc4, #5b91e4)",
  },
  {
    key: "f" as MacroKey,
    letter: "F",
    label: "Fat",
    color: "light-dark(#b8830a, #b98a20)",
    textColor: "light-dark(#96690a, #b98a20)",
  },
  {
    key: "c" as MacroKey,
    letter: "C",
    label: "Carbs",
    color: "light-dark(#c03b2e, #cf6152)",
    textColor: "light-dark(#c03b2e, #e07d6e)",
  },
] as const

export type Entry = {
  id: string
  label: string
  kcal: number
  p: number
  f: number
  c: number
  // present when the entry came from the AI path (Variant C renders these)
  ai?: {
    flagged: MacroKey[] | "kcal"[] | (MacroKey | "kcal")[]
    grounded: boolean
    searchQuery?: string
  }
}

export const SEED_ENTRIES: Entry[] = [
  { id: "s1", label: "Oatmeal with blueberries", kcal: 320, p: 12, c: 54, f: 7 },
  { id: "s2", label: "Cappuccino", kcal: 90, p: 0, c: 0, f: 0 },
  { id: "s3", label: "Chicken caesar wrap", kcal: 540, p: 38, c: 0, f: 0 },
  { id: "s4", label: "Musly", kcal: 0, p: 0, c: 0, f: 0 },
  { id: "s5", label: "Greek yogurt with honey", kcal: 150, p: 15, c: 0, f: 0 },
]

const WEEK = [
  { d: "S", n: 5, logged: true },
  { d: "M", n: 6, logged: true },
  { d: "T", n: 7, logged: false },
  { d: "W", n: 8, logged: true },
  { d: "T", n: 9, logged: true },
  { d: "F", n: 10, logged: true, today: true },
  { d: "S", n: 11, future: true },
]

// Mock of the Google Search Suggestions chip that grounding compliance
// requires whenever a response is grounded (searchEntryPoint stand-in).
export function GoogleChip({ query }: { query: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#eee5d2] bg-[#fffdf7] py-1 pr-2.5 pl-1.5 text-[11px] text-[#7d7060] dark:border-[#3a2f22] dark:bg-[#211a12] dark:text-[#a5988a]">
      <span
        aria-hidden
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold dark:bg-[#2a211a]"
        style={{
          color: "#4285F4",
          border: "1px solid light-dark(#e8e0cd, #3a2f22)",
        }}
      >
        G
      </span>
      <span className="truncate">{query}</span>
    </span>
  )
}

function ProgressRing({ kcal }: { kcal: number }) {
  const size = 116
  const c = size / 2
  const r = 46
  const circ = 2 * Math.PI * r
  const consumed = Math.min(1, kcal / GOAL_KCAL)
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
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xl leading-none font-bold tabular-nums">
          {kcal.toLocaleString()}
        </div>
        <div className="mt-0.5 text-[10px] text-[#7d7060] dark:text-[#a5988a]">
          kcal
        </div>
      </div>
    </div>
  )
}

function EntryCard({ entry }: { entry: Entry }) {
  const noKcal = entry.kcal === 0
  const chips = MACROS.filter((m) => entry[m.key] > 0)
  const flagged = new Set(entry.ai?.flagged ?? [])
  return (
    <div
      className={
        "rounded-2xl px-4 py-3 " +
        (noKcal
          ? "border border-dashed border-[#cbbfa4] dark:border-[#4a3e2e]"
          : "border border-[#eee5d2] bg-[#fffdf7] dark:border-[#3a2f22] dark:bg-[#2a211a]")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[15px] font-medium">
            <span className="truncate">{entry.label}</span>
            {entry.ai && (
              <Sparkles
                aria-label="Filled by AI"
                className="h-3 w-3 shrink-0 text-[#a5988a]"
              />
            )}
          </div>
          {(chips.length > 0 || entry.ai?.grounded) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
                  {flagged.has(m.key) ? "~" : ""}
                  {m.letter} {entry[m.key]}g
                </span>
              ))}
              {entry.ai?.grounded && entry.ai.searchQuery && (
                <GoogleChip query={entry.ai.searchQuery} />
              )}
            </div>
          )}
        </div>
        <div
          className={
            "shrink-0 text-[15px] font-semibold tabular-nums " +
            (noKcal ? "text-[#a5988a]" : "")
          }
        >
          {flagged.has("kcal") ? "~" : ""}
          {entry.kcal}
          <span className="ml-1 text-[11px] font-normal text-[#7d7060] dark:text-[#a5988a]">
            kcal
          </span>
        </div>
      </div>
    </div>
  )
}

export function Shell({
  entries,
  addCard,
  overlay,
}: {
  entries: Entry[]
  addCard: React.ReactNode
  overlay?: React.ReactNode
}) {
  const totals = entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      p: acc.p + e.p,
      f: acc.f + e.f,
      c: acc.c + e.c,
    }),
    { kcal: 0, p: 0, f: 0, c: 0 }
  )
  const remaining = GOAL_KCAL - totals.kcal
  const pct = Math.round((totals.kcal / GOAL_KCAL) * 100)

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col bg-[#f6f1e6] text-[#2b2015] dark:bg-[#17110c] dark:text-[#f3ece2]">
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
                (day.today ? "opacity-70" : "text-[#7d7060] dark:text-[#a5988a]")
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

      {addCard}

      <div className="mx-4 mt-3 flex flex-col gap-2 pb-3">
        {entries.map((e) => (
          <EntryCard key={e.id} entry={e} />
        ))}
      </div>

      <div className="flex-1" />

      <div className="sticky bottom-0 px-3 pb-3">
        <div className="flex items-center gap-4 rounded-[28px] border border-[#eee5d2] bg-[#fffdf7] p-4 shadow-[0_8px_30px_rgba(43,32,21,0.12)] dark:border-[#3a2f22] dark:bg-[#2a211a] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          <ProgressRing kcal={totals.kcal} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg leading-tight font-bold tabular-nums">
                  Remaining: {remaining.toLocaleString()}
                </div>
                <div className="mt-0.5 text-xs text-[#7d7060] tabular-nums dark:text-[#a5988a]">
                  {pct}% of {GOAL_KCAL.toLocaleString()} goal
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
                  {m.letter} {totals[m.key]}g
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {overlay}
    </div>
  )
}

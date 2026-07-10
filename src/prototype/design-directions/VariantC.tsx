// PROTOTYPE — Variant C "Timeline" (issue #4).
// Thesis: calm minimalism — the day is a quiet vertical timeline; typography and
// spacing do the work. ONE accent (indigo); macros carry no hue at all — labels are
// the identity channel (the deliberate opposite pole to A and B).
// Type: Outfit (headings + numbers) over Public Sans.
import { ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react"

import { ENTRIES, GOAL_KCAL, MACRO_REF, REMAINING, TOTALS } from "./mock-data"

const ACCENT = "light-dark(#4548c9, #9a9df4)"
const TRACK = `color-mix(in oklab, ${ACCENT} 16%, transparent)`

const METERS = [
  { label: "Protein", value: TOTALS.p, ref: MACRO_REF.p },
  { label: "Carbs", value: TOTALS.c, ref: MACRO_REF.c },
  { label: "Fat", value: TOTALS.f, ref: MACRO_REF.f },
]

function SlimRing() {
  const size = 92
  const c = size / 2
  const r = 40
  const circ = 2 * Math.PI * r
  const consumed = Math.min(1, TOTALS.kcal / GOAL_KCAL)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* track = lighter step of the accent's own ramp */}
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={TRACK}
          strokeWidth={6}
        />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={ACCENT}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${circ * consumed} ${circ * (1 - consumed)}`}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-['Outfit_Variable',sans-serif] text-xl leading-none font-semibold">
          {REMAINING}
        </div>
        <div className="mt-0.5 text-[10px] text-[#6a6d80] dark:text-[#9599ad]">
          left
        </div>
      </div>
    </div>
  )
}

export function VariantC() {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col bg-[#f6f6fa] text-[#191b26] dark:bg-[#131420] dark:text-[#e9eaf2]">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-5">
        <div
          className="font-['Outfit_Variable',sans-serif] text-base font-semibold tracking-tight"
          style={{ color: ACCENT }}
        >
          makrofy
        </div>
        <button
          aria-label="Settings"
          className="text-[#6a6d80] dark:text-[#9599ad]"
        >
          <Settings2 className="h-5 w-5" />
        </button>
      </header>

      {/* Date heading */}
      <div className="flex items-end justify-between px-5 pt-4">
        <div>
          <h1 className="font-['Outfit_Variable',sans-serif] text-[28px] leading-none font-semibold">
            Today
          </h1>
          <div className="mt-1.5 text-sm text-[#6a6d80] dark:text-[#9599ad]">
            Thursday, 10 July
          </div>
        </div>
        <div className="flex gap-2">
          <button
            aria-label="Previous day"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e3e4ee] bg-white dark:border-[#2a2c3d] dark:bg-[#1c1e2c]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            aria-label="Next day"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e3e4ee] bg-white dark:border-[#2a2c3d] dark:bg-[#1c1e2c]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Add pill */}
      <button
        className="mx-5 mt-4 flex items-center justify-center gap-1.5 rounded-full py-3 text-sm font-medium"
        style={{
          color: ACCENT,
          backgroundColor: `color-mix(in oklab, ${ACCENT} 9%, transparent)`,
        }}
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        Add food
      </button>

      {/* Timeline */}
      <div className="relative mx-5 mt-4 pb-4">
        {/* spine */}
        <div
          className="absolute top-3 bottom-3 left-[60px] w-px"
          style={{
            backgroundColor: `color-mix(in oklab, ${ACCENT} 22%, transparent)`,
          }}
        />
        {ENTRIES.map((e) => (
          <div key={e.id} className="relative flex items-start gap-4 py-2.5">
            <div className="w-10 shrink-0 pt-0.5 text-right text-[11px] text-[#6a6d80] tabular-nums dark:text-[#9599ad]">
              {e.time}
            </div>
            {/* dot with surface ring so it reads where it crosses the spine */}
            <div
              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-[#f6f6fa] dark:ring-[#131420]"
              style={{ backgroundColor: ACCENT }}
            />
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{e.label}</div>
                <div className="mt-0.5 text-[11px] text-[#6a6d80] tabular-nums dark:text-[#9599ad]">
                  {e.p}P · {e.c}C · {e.f}F
                </div>
              </div>
              <div className="shrink-0 font-['Outfit_Variable',sans-serif] text-sm font-semibold tabular-nums">
                {e.kcal}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1" />

      {/* Bottom summary */}
      <div className="rounded-t-3xl border-t border-[#e3e4ee] bg-white px-5 py-4 dark:border-[#2a2c3d] dark:bg-[#1c1e2c]">
        <div className="flex items-center gap-5">
          <SlimRing />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            {METERS.map((m) => (
              <div key={m.label} className="flex items-center gap-2.5">
                <span className="w-12 shrink-0 text-xs text-[#6a6d80] dark:text-[#9599ad]">
                  {m.label}
                </span>
                <div
                  className="h-1 min-w-0 flex-1 rounded-full"
                  style={{ backgroundColor: TRACK }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (m.value / m.ref) * 100)}%`,
                      backgroundColor: ACCENT,
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums">
                  {m.value}g
                </span>
              </div>
            ))}
            <div className="text-right text-[10px] text-[#6a6d80] tabular-nums dark:text-[#9599ad]">
              {TOTALS.kcal.toLocaleString()} / {GOAL_KCAL.toLocaleString()} kcal
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

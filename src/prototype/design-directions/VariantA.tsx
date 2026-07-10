// PROTOTYPE — Variant A "Instrument" (issue #4).
// Thesis: the app is a precision gauge you glance at, like a cockpit fuel readout.
// Type: Space Grotesk (identity + numbers) over Public Sans. Palette: petrol ink,
// signal amber, macros teal/violet/rose (validated light+dark, dataviz skill).
// Signature: the always-dark cockpit summary bar with a ticked 270° gauge.
import { ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react"

import { ENTRIES, GOAL_KCAL, REMAINING, TOTALS } from "./mock-data"

// Macros P/C/F — fixed order everywhere. These are the DARK-set colors because they
// only ever render on the always-dark cockpit panel.
const MACROS = [
  { key: "P", label: "Protein", value: TOTALS.p, ref: 130, color: "#23988a" },
  { key: "C", label: "Carbs", value: TOTALS.c, ref: 250, color: "#7f73e2" },
  { key: "F", label: "Fat", value: TOTALS.f, ref: 75, color: "#c94f6f" },
]
// Dots in the ledger rows sit on light cards in light mode → light-set colors there.
const MACRO_DOTS_LIGHT = ["#0f8f80", "#7263d8", "#c04463"]
const MACRO_DOTS_DARK = ["#23988a", "#7f73e2", "#c94f6f"]

const AMBER_DARK = "#c9913a" // gauge fill on the dark panel (≥3:1 on #0d1319)

function Gauge() {
  // 270° gauge, gap at the bottom. pathLength=100 → track occupies 75 units.
  const consumed = Math.min(1, TOTALS.kcal / GOAL_KCAL)
  const size = 148
  const c = size / 2
  const r = 56
  const ticks = Array.from({ length: 25 }, (_, i) => {
    const angle = ((135 + i * (270 / 24)) * Math.PI) / 180
    const major = i % 6 === 0
    const r1 = r + 9
    const r2 = major ? r + 17 : r + 13
    return {
      x1: c + r1 * Math.cos(angle),
      y1: c + r1 * Math.sin(angle),
      x2: c + r2 * Math.cos(angle),
      y2: c + r2 * Math.sin(angle),
      major,
    }
  })
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={
              t.major ? "rgba(232,237,242,0.5)" : "rgba(232,237,242,0.18)"
            }
            strokeWidth={t.major ? 2 : 1}
          />
        ))}
        {/* track — darker step of the amber ramp, never gray */}
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="#3d2f14"
          strokeWidth={10}
          pathLength={100}
          strokeDasharray="75 25"
          transform={`rotate(135 ${c} ${c})`}
        />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={AMBER_DARK}
          strokeWidth={10}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${75 * consumed} ${100 - 75 * consumed}`}
          transform={`rotate(135 ${c} ${c})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-heading text-4xl leading-none font-semibold text-[#f2f5f8]">
          {REMAINING}
        </div>
        <div className="mt-1 text-[10px] tracking-[0.18em] text-[#8b98a5] uppercase">
          kcal left
        </div>
      </div>
    </div>
  )
}

export function VariantA() {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col bg-[#eef1f4] text-[#17202a] dark:bg-[#12181e] dark:text-[#e8edf2]">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-4 pb-1">
        <div className="font-heading text-sm font-semibold tracking-[0.22em]">
          MAKROFY
        </div>
        <button
          aria-label="Settings"
          className="text-[#5b6875] dark:text-[#8b98a5]"
        >
          <Settings2 className="h-5 w-5" />
        </button>
      </header>

      {/* Date stepper */}
      <div className="flex items-center justify-between px-4 py-2">
        <button
          aria-label="Previous day"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#dde3e9] bg-[#f9fafb] dark:border-[#26303b] dark:bg-[#1a2129]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <div className="font-heading text-sm font-semibold tracking-[0.18em]">
            TODAY
          </div>
          <div className="mt-0.5 text-[11px] text-[#5b6875] dark:text-[#8b98a5]">
            Thu 10 Jul
          </div>
          <div className="mt-1.5 flex items-center justify-center gap-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <span
                key={i}
                className={
                  i === 3
                    ? "h-1.5 w-4 rounded-full bg-[#c8801f] dark:bg-[#c9913a]"
                    : "h-1.5 w-1.5 rounded-full bg-[#c6cfd8] dark:bg-[#2c3742]"
                }
              />
            ))}
          </div>
        </div>
        <button
          aria-label="Next day"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#dde3e9] bg-[#f9fafb] dark:border-[#26303b] dark:bg-[#1a2129]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Add command bar */}
      <div className="mx-4 mt-1 flex items-center gap-2 rounded-xl border border-[#dde3e9] bg-[#f9fafb] p-1.5 pl-3 dark:border-[#26303b] dark:bg-[#1a2129]">
        <input
          placeholder="Log food…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#8b98a5]"
        />
        <input
          placeholder="kcal"
          inputMode="decimal"
          className="w-14 bg-transparent text-right font-heading text-sm tabular-nums outline-none placeholder:text-[#8b98a5]"
        />
        <button
          aria-label="Add entry"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#c8801f] text-[#12181e] dark:bg-[#c9913a]"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>

      {/* Ledger */}
      <div className="mx-4 mt-3 divide-y divide-[#e7ebef] rounded-xl border border-[#dde3e9] bg-[#f9fafb] dark:divide-[#212b35] dark:border-[#26303b] dark:bg-[#1a2129]">
        {ENTRIES.map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between px-3.5 py-2.5"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{e.label}</div>
              <div className="mt-0.5 text-[11px] text-[#8b98a5] tabular-nums">
                {e.time}
              </div>
            </div>
            <div className="ml-3 text-right">
              <div className="font-heading text-sm font-semibold tabular-nums">
                {e.kcal}
              </div>
              <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] text-[#5b6875] tabular-nums dark:text-[#8b98a5]">
                {[e.p, e.c, e.f].map((v, i) => (
                  <span key={i} className="flex items-center gap-0.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor: `light-dark(${MACRO_DOTS_LIGHT[i]}, ${MACRO_DOTS_DARK[i]})`,
                      }}
                    />
                    {v}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1" />

      {/* Cockpit — dark in BOTH modes (the signature) */}
      <div className="mt-4 rounded-t-3xl bg-[#0d1319] px-5 pt-4 pb-6 text-[#e8edf2]">
        <div className="flex items-center gap-5">
          <Gauge />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {MACROS.map((m) => (
              <div key={m.key}>
                <div className="flex items-baseline justify-between">
                  <span className="flex items-center gap-1.5 text-[10px] tracking-[0.14em] text-[#8b98a5] uppercase">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: m.color }}
                    />
                    {m.label}
                  </span>
                  <span className="font-heading text-xs font-semibold tabular-nums">
                    {m.value}g
                  </span>
                </div>
                <div
                  className="mt-1 h-1.5 rounded-full"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${m.color} 22%, transparent)`,
                  }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (m.value / m.ref) * 100)}%`,
                      backgroundColor: m.color,
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="text-right text-[10px] text-[#8b98a5] tabular-nums">
              {TOTALS.kcal.toLocaleString()} / {GOAL_KCAL.toLocaleString()} kcal
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

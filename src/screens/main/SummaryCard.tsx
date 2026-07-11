import { BarChart3 } from "lucide-react"

import { MACROS, macroTint } from "./macros"
import { GOAL_KCAL, PCT_OF_GOAL, REMAINING, TOTALS } from "./mock"

const TOTAL_GRAMS = { p: TOTALS.p, f: TOTALS.f, c: TOTALS.c } as const

// Single-hue ink meter — consumed kcal in the center. Hero number, so
// proportional figures (tabular-nums is for lists/columns only).
function ProgressRing() {
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
          stroke="var(--foreground)"
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={`${circ * consumed} ${circ * (1 - consumed)}`}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xl leading-none font-bold">
          {TOTALS.kcal.toLocaleString()}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">kcal</div>
      </div>
    </div>
  )
}

// Floating sticky summary: ring, Remaining + % of goal, outlined macro pills,
// stats button (opens the dashboard once #22 lands).
export function SummaryCard() {
  return (
    <div className="sticky bottom-0 px-3 pb-3">
      <div className="flex items-center gap-4 rounded-[28px] border bg-card p-4 shadow-[0_8px_30px_rgba(43,32,21,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
        <ProgressRing />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-lg leading-tight font-bold">
                Remaining: {REMAINING.toLocaleString()}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {PCT_OF_GOAL}% of {GOAL_KCAL.toLocaleString()} goal
              </div>
            </div>
            <button
              aria-label="Statistics"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-input text-muted-foreground"
            >
              <BarChart3 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t pt-2.5">
            {MACROS.map((m) => (
              <span
                key={m.key}
                className="rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap tabular-nums"
                style={{
                  borderColor: m.mark,
                  backgroundColor: macroTint(m.mark, 8),
                  color: m.text,
                }}
              >
                {m.letter} {TOTAL_GRAMS[m.key]}g
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

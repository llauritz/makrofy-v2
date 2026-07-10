/* eslint-disable react-refresh/only-export-components -- prototype: chart kit shares a file on purpose */
// PROTOTYPE — issue #7. Hand-rolled SVG marks shared by the stats variants.
// Calories are single-series → ink, no legend. Macros use the validated
// P/F/C palette. Untracked days render as gaps (never zeros); future days
// get no marks; the goal is a dashed threshold line (a real threshold, not grid).
import type { ReactNode } from "react"

import { MACROS } from "./Shell"
import { GOAL_KCAL, inRange, type Day } from "./data"

export const INK = "light-dark(#2b2015, #f3ece2)"
export const MUTED = "light-dark(#7d7060, #a5988a)"
export const TRACK = "light-dark(#efe6d4, #3a2f22)"
export const TAN = "light-dark(#cbbfa4, #5a4c3b)" // de-emphasis marks
export const SURFACE = "light-dark(#fffdf7, #2a211a)" // card = chart surface
export const DASH = "light-dark(#cbbfa4, #4a3e2e)"

/** Bar with a 4px rounded data-end and a square baseline. */
function topRoundedRect(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

function bottomRoundedRect(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y} L${x + w},${y} L${x + w},${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} L${x + rr},${y + h} Q${x},${y + h} ${x},${y + h - rr} Z`
}

const fmt = (n: number) => n.toLocaleString("en-US")

/* ---------------------------------------------------------------- columns */

export function WeekColumns({
  days,
  width = 326,
  height = 128,
  mini = false,
}: {
  days: Day[]
  width?: number
  height?: number
  mini?: boolean
}) {
  const axis = mini ? 12 : 16
  const top = mini ? 4 : 14
  const plotH = height - axis - top
  const maxY = Math.max(GOAL_KCAL, ...days.map((d) => d.kcal ?? 0)) * 1.06
  const y = (v: number) => top + plotH - (v / maxY) * plotH
  const band = width / days.length
  const barW = Math.min(mini ? 12 : 22, band - 8)
  const maxDay = days.reduce(
    (best, d) =>
      d.kcal != null && !d.today && (best == null || d.kcal > (best.kcal as number))
        ? d
        : best,
    null as Day | null
  )
  return (
    <svg width={width} height={height} className="block">
      {/* goal threshold */}
      <line
        x1={0}
        x2={width}
        y1={y(GOAL_KCAL)}
        y2={y(GOAL_KCAL)}
        stroke={MUTED}
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.6}
      />
      {!mini && (
        <text
          x={width - 2}
          y={y(GOAL_KCAL) - 4}
          textAnchor="end"
          fontSize={9}
          fill={MUTED}
        >
          goal {fmt(GOAL_KCAL)}
        </text>
      )}
      {days.map((d, i) => {
        const cx = i * band + band / 2
        const x = cx - barW / 2
        if (d.kcal == null) {
          // untracked: an empty dashed slot at the baseline, not a zero bar
          return (
            <g key={i}>
              <rect
                x={x}
                y={top + plotH - 7}
                width={barW}
                height={6}
                rx={3}
                fill="none"
                stroke={DASH}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <text x={cx} y={height - 3} textAnchor="middle" fontSize={mini ? 8 : 10} fill={MUTED} opacity={0.7}>
                {"SMTWTFS"[d.date.getDay()]}
              </text>
            </g>
          )
        }
        const h = top + plotH - y(d.kcal)
        return (
          <g key={i}>
            <path
              d={topRoundedRect(x, y(d.kcal), barW, h, 4)}
              fill={INK}
              opacity={d.today ? 0.4 : 1}
            />
            {!mini && maxDay === d && (
              <text x={cx} y={y(d.kcal) - 4} textAnchor="middle" fontSize={9} fill={MUTED}>
                {fmt(d.kcal)}
              </text>
            )}
            {!mini && d.today && (
              <text x={cx} y={y(d.kcal) - 4} textAnchor="middle" fontSize={9} fill={MUTED}>
                now
              </text>
            )}
            <text
              x={cx}
              y={height - 3}
              textAnchor="middle"
              fontSize={mini ? 8 : 10}
              fontWeight={d.today ? 700 : 400}
              fill={d.today ? INK : MUTED}
            >
              {"SMTWTFS"[d.date.getDay()]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------------ lines */

/** Split a series into contiguous segments at nulls (untracked = gap). */
function segments(points: { x: number; y: number | null }[]) {
  const segs: { x: number; y: number }[][] = []
  let cur: { x: number; y: number }[] = []
  for (const p of points) {
    if (p.y == null) {
      if (cur.length > 1) segs.push(cur)
      cur = []
    } else {
      cur.push(p as { x: number; y: number })
    }
  }
  if (cur.length > 1) segs.push(cur)
  return segs
}

export function TrendLine({
  daily,
  avg,
  dates,
  width = 326,
  height = 132,
}: {
  daily?: (number | null)[]
  avg: (number | null)[]
  dates: Date[]
  width?: number
  height?: number
}) {
  const axis = 14
  const padL = 30
  const padR = 34
  const top = 8
  const plotW = width - padL - padR
  const plotH = height - axis - top
  const all = [...(daily ?? []), ...avg, GOAL_KCAL].filter((v): v is number => v != null)
  const lo = Math.min(...all) - 120
  const hi = Math.max(...all) + 120
  const x = (i: number) => padL + (i / (avg.length - 1)) * plotW
  const y = (v: number) => top + plotH - ((v - lo) / (hi - lo)) * plotH
  const ticks = [1500, 2000, 2500].filter((t) => t > lo && t < hi)
  const toPath = (seg: { x: number; y: number }[]) =>
    seg.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
  const avgPts = avg.map((v, i) => ({ x: x(i), y: v == null ? null : y(v) }))
  const dailyPts = (daily ?? []).map((v, i) => ({ x: x(i), y: v == null ? null : y(v) }))
  const lastIdx = avg.length - 1
  const lastAvg = avg[lastIdx]
  const mid = Math.floor(avg.length / 2)
  const fmtDate = (d: Date) =>
    `${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}`
  return (
    <svg width={width} height={height} className="block">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={TRACK} strokeWidth={1} />
          <text x={padL - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill={MUTED}>
            {t / 1000}k
          </text>
        </g>
      ))}
      <line
        x1={padL}
        x2={width - padR}
        y1={y(GOAL_KCAL)}
        y2={y(GOAL_KCAL)}
        stroke={MUTED}
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.6}
      />
      {daily &&
        segments(dailyPts).map((seg, i) => (
          <path key={`d${i}`} d={toPath(seg)} fill="none" stroke={TAN} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      {segments(avgPts).map((seg, i) => (
        <path key={`a${i}`} d={toPath(seg)} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {lastAvg != null && (
        <g>
          <circle cx={x(lastIdx)} cy={y(lastAvg)} r={6.5} fill={SURFACE} />
          <circle cx={x(lastIdx)} cy={y(lastAvg)} r={4.5} fill={INK} />
          <text x={x(lastIdx) + 9} y={y(lastAvg) + 3} fontSize={10} fontWeight={600} fill={INK}>
            {fmt(lastAvg)}
          </text>
        </g>
      )}
      {[0, mid, lastIdx].map((i) => (
        <text
          key={i}
          x={x(i)}
          y={height - 2}
          textAnchor={i === 0 ? "start" : i === lastIdx ? "end" : "middle"}
          fontSize={9}
          fill={MUTED}
        >
          {fmtDate(dates[i])}
        </text>
      ))}
    </svg>
  )
}

export function Sparkline({
  values,
  width = 64,
  height = 22,
}: {
  values: (number | null)[]
  width?: number
  height?: number
}) {
  const nums = values.filter((v): v is number => v != null)
  if (nums.length < 2) return null
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  const x = (i: number) => 2 + (i / (values.length - 1)) * (width - 8)
  const y = (v: number) => 2 + (height - 4) - ((v - lo) / Math.max(1, hi - lo)) * (height - 4)
  const pts = values.map((v, i) => ({ x: x(i), y: v == null ? null : y(v) }))
  const last = [...values].reverse().findIndex((v) => v != null)
  const lastIdx = last === -1 ? -1 : values.length - 1 - last
  return (
    <svg width={width} height={height} className="block">
      {segments(pts).map((seg, i) => (
        <path
          key={i}
          d={seg.map((p, j) => `${j === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke={TAN}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      ))}
      {lastIdx >= 0 && values[lastIdx] != null && (
        <circle cx={x(lastIdx)} cy={y(values[lastIdx] as number)} r={2.5} fill={INK} />
      )}
    </svg>
  )
}

/* ----------------------------------------------------------------- macros */

export function MacroStackWeek({
  days,
  width = 326,
  height = 124,
}: {
  days: Day[]
  width?: number
  height?: number
}) {
  const axis = 16
  const plotH = height - axis - 4
  const band = width / days.length
  const barW = Math.min(22, band - 8)
  const GAP = 2
  return (
    <svg width={width} height={height} className="block">
      {days.map((d, i) => {
        const cx = i * band + band / 2
        const xx = cx - barW / 2
        const label = (
          <text
            key="l"
            x={cx}
            y={height - 3}
            textAnchor="middle"
            fontSize={10}
            fontWeight={d.today ? 700 : 400}
            fill={d.today ? INK : MUTED}
          >
            {"SMTWTFS"[d.date.getDay()]}
          </text>
        )
        if (d.kcal == null) {
          return (
            <g key={i}>
              <rect x={xx} y={4 + plotH - 7} width={barW} height={6} rx={3} fill="none" stroke={DASH} strokeWidth={1} strokeDasharray="3 3" />
              {label}
            </g>
          )
        }
        // share of calories: P 4 kcal/g, F 9, C 4
        const kc = { p: d.p * 4, f: d.f * 9, c: d.c * 4 }
        const total = kc.p + kc.f + kc.c || 1
        let yCursor = 4 + plotH
        const segs = MACROS.map((m) => {
          const h = (kc[m.key] / total) * (plotH - GAP * 2)
          yCursor -= h
          const seg = { y: yCursor, h, color: m.color, key: m.key }
          yCursor -= GAP
          return seg
        })
        return (
          <g key={i} opacity={d.today ? 0.55 : 1}>
            {segs.map((s, j) => (
              <path
                key={s.key}
                d={
                  j === segs.length - 1
                    ? topRoundedRect(xx, s.y, barW, s.h, 4)
                    : j === 0
                      ? bottomRoundedRect(xx, s.y, barW, s.h, 4)
                      : `M${xx},${s.y} h${barW} v${s.h} h${-barW} Z`
                }
                fill={s.color}
              />
            ))}
            {label}
          </g>
        )
      })}
    </svg>
  )
}

/* ---------------------------------------------------------- goal delta */

export function GoalDelta({
  days,
  width = 326,
  height = 116,
}: {
  days: Day[]
  width?: number
  height?: number
}) {
  const axis = 14
  const plotH = height - axis - 12
  const deltas = days.map((d) => (d.kcal == null || d.today ? null : d.kcal - GOAL_KCAL))
  const maxAbs = Math.max(300, ...deltas.map((v) => Math.abs(v ?? 0))) * 1.1
  const zero = 12 + plotH / 2
  const y = (v: number) => zero - (v / maxAbs) * (plotH / 2)
  const band = width / days.length
  const barW = Math.min(14, band - 6)
  const maxI = deltas.reduce<number>((bi, v, i) => (v != null && (bi === -1 || v > (deltas[bi] as number)) ? i : bi), -1)
  const minI = deltas.reduce<number>((bi, v, i) => (v != null && (bi === -1 || v < (deltas[bi] as number)) ? i : bi), -1)
  const fmtDate = (d: Date) =>
    `${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}`
  return (
    <svg width={width} height={height} className="block">
      <line x1={0} x2={width} y1={zero} y2={zero} stroke={TRACK} strokeWidth={1} />
      {days.map((d, i) => {
        const v = deltas[i]
        const cx = i * band + band / 2
        if (v == null)
          return d.today ? null : (
            <circle key={i} cx={cx} cy={zero} r={1.5} fill={DASH} />
          )
        const over = v >= 0
        const h = Math.abs(y(v) - zero)
        return (
          <g key={i}>
            <path
              d={
                over
                  ? topRoundedRect(cx - barW / 2, y(v), barW, h, 3)
                  : bottomRoundedRect(cx - barW / 2, zero, barW, h, 3)
              }
              fill={over ? INK : TAN}
            />
            {(i === maxI || i === minI) && (
              <text
                x={cx}
                y={over ? y(v) - 4 : y(v) + 11}
                textAnchor="middle"
                fontSize={9}
                fill={MUTED}
              >
                {v > 0 ? "+" : "−"}
                {Math.abs(v)}
              </text>
            )}
          </g>
        )
      })}
      <text x={2} y={height - 2} fontSize={9} fill={MUTED}>
        {fmtDate(days[0].date)}
      </text>
      <text x={width - 2} y={height - 2} textAnchor="end" fontSize={9} fill={MUTED}>
        {fmtDate(days[days.length - 1].date)}
      </text>
    </svg>
  )
}

/* ----------------------------------------------------------- month heat */

export function MonthHeat({
  days,
  width = 326,
}: {
  days: Day[] // tracked days of the displayed month
  width?: number
}) {
  const year = 2026
  const month = 6 // July
  const first = new Date(year, month, 1)
  const daysInMonth = 31
  const startCol = first.getDay()
  const cell = Math.floor((width - 6 * 4) / 7)
  const rows = Math.ceil((startCol + daysInMonth) / 7)
  const byDate = new Map(days.filter((d) => d.date.getMonth() === month).map((d) => [d.date.getDate(), d]))
  const lo = 1400
  const hi = 2700
  const height = 14 + rows * (cell + 4)
  return (
    <svg width={width} height={height} className="block">
      {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
        <text key={i} x={i * (cell + 4) + cell / 2} y={9} textAnchor="middle" fontSize={9} fill={MUTED}>
          {w}
        </text>
      ))}
      {Array.from({ length: daysInMonth }, (_, i) => {
        const dayN = i + 1
        const idx = startCol + i
        const cx = (idx % 7) * (cell + 4)
        const cy = 14 + Math.floor(idx / 7) * (cell + 4)
        const d = byDate.get(dayN)
        const future = dayN > 10
        if (future) {
          return (
            <text key={dayN} x={cx + cell / 2} y={cy + cell / 2 + 3} textAnchor="middle" fontSize={10} fill={MUTED} opacity={0.45}>
              {dayN}
            </text>
          )
        }
        if (!d || d.kcal == null) {
          return (
            <g key={dayN}>
              <rect x={cx} y={cy} width={cell} height={cell} rx={9} fill="none" stroke={DASH} strokeWidth={1} strokeDasharray="3 3" />
              <text x={cx + cell / 2} y={cy + cell / 2 + 3} textAnchor="middle" fontSize={10} fill={MUTED}>
                {dayN}
              </text>
            </g>
          )
        }
        const t = Math.max(0, Math.min(1, ((d.kcal as number) - lo) / (hi - lo)))
        const alpha = d.today ? 0.14 : 0.12 + t * 0.62
        return (
          <g key={dayN}>
            <rect
              x={cx}
              y={cy}
              width={cell}
              height={cell}
              rx={9}
              fill={INK}
              opacity={alpha}
              stroke={d.today ? INK : "none"}
              strokeWidth={d.today ? 1.5 : 0}
            />
            <text
              x={cx + cell / 2}
              y={cy + cell / 2 + 3}
              textAnchor="middle"
              fontSize={10}
              fontWeight={d.today ? 700 : 400}
              fill={alpha > 0.45 ? SURFACE : MUTED}
            >
              {dayN}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------ range dots */

export function RangeDots({ days, size = 12 }: { days: Day[]; size?: number }) {
  return (
    <div className="flex shrink-0 items-end gap-2">
      {days.map((d, i) => {
        const state =
          d.today ? "today" : d.kcal == null ? "untracked" : inRange(d.kcal) ? "in" : "out"
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <svg width={size} height={size} className="block">
              {state === "in" && <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill={INK} />}
              {state === "out" && (
                <circle cx={size / 2} cy={size / 2} r={size / 2 - 1.5} fill="none" stroke={INK} strokeWidth={1.5} />
              )}
              {state === "untracked" && (
                <circle cx={size / 2} cy={size / 2} r={size / 2 - 1.5} fill="none" stroke={DASH} strokeWidth={1} strokeDasharray="2.5 2.5" />
              )}
              {state === "today" && <circle cx={size / 2} cy={size / 2} r={2.5} fill={INK} />}
            </svg>
            <span
              className="text-[9px]"
              style={{ color: MUTED, fontWeight: d.today ? 700 : 400 }}
            >
              {"SMTWTFS"[d.date.getDay()]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------- stat tile */

export function StatTile({
  label,
  value,
  unit,
  note,
  spark,
}: {
  label: string
  value: string
  unit?: string
  note?: ReactNode
  spark?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-[#eee5d2] bg-[#fffdf7] px-3.5 py-3 dark:border-[#3a2f22] dark:bg-[#2a211a]">
      <div className="text-[11px]" style={{ color: MUTED }}>
        {label}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className="text-[22px] leading-none font-semibold">{value}</span>
          {unit && (
            <span className="text-[11px]" style={{ color: MUTED }}>
              {unit}
            </span>
          )}
        </div>
        {spark}
      </div>
      {note && (
        <div className="mt-1.5 text-[10px] leading-snug" style={{ color: MUTED }}>
          {note}
        </div>
      )}
    </div>
  )
}

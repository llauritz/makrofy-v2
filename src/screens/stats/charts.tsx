import type { ReactNode } from "react"

import { narrowWeekday, shortDayLabel } from "@/lib/day"
import { useI18n } from "@/lib/i18n/useI18n"
import {
  countsInAverages,
  dayShare,
  type RangeDot,
  type StatDay,
} from "@/lib/stats"
import { MACROS } from "@/screens/main/macros"

// Hand-rolled SVG marks for the stats surfaces (issue #22), grown from the
// prototype/stats kit (#7). Calories are single-series → monochrome ink; the
// P/F/C palette stays reserved for macros. The stats core decides admission;
// these only translate a StatDay's flags into marks:
//   untracked → a dashed slot (a gap, never a zero) · today → a lighter "now"
//   bar, no value counted · *Some* → a small solid tan stub, distinct from a
//   gap · *Most* → an approximate (dash-outlined, washed) bar.
// Every chart pairs an aria-hidden SVG with a visually-hidden table — the
// screen-reader equivalent the prototype skipped, one announcement, not two —
// and native <title> tooltips per mark for pointer users.

const INK = "var(--foreground)"
const MUTED = "var(--muted-foreground)"
const TRACK = "light-dark(#efe6d4, #3a2f22)" // hairline grid, from the ring's track
/** De-emphasis tan — the daily trend line, Coverage marks, and their legends. */
export const TAN = "light-dark(#cbbfa4, #5a4c3b)"
const DASH = "light-dark(#cbbfa4, #4a3e2e)" // dashed gap slots
const SURFACE = "var(--card)"

/** Bar with a rounded data-end and a square baseline. */
function topRoundedRect(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

function bottomRoundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y} L${x + w},${y} L${x + w},${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} L${x + rr},${y + h} Q${x},${y + h} ${x},${y + h - rr} Z`
}

/** The dashed baseline slot an untracked day gets — a gap, never a zero bar. */
function GapSlot({
  x,
  w,
  baseline,
}: {
  x: number
  w: number
  baseline: number
}) {
  return (
    <rect
      x={x}
      y={baseline - 7}
      width={w}
      height={6}
      rx={3}
      fill="none"
      stroke={DASH}
      strokeWidth={1}
      strokeDasharray="3 3"
    />
  )
}

/** The solid tan stub a *Some* day gets — "tracked badly", distinct from a gap. */
function SomeStub({
  x,
  w,
  baseline,
}: {
  x: number
  w: number
  baseline: number
}) {
  return <rect x={x} y={baseline - 7} width={w} height={6} rx={3} fill={TAN} />
}

/**
 * The screen-reader equivalent of a chart: the same days and values as a
 * plain table. Rendered beside an aria-hidden SVG.
 */
function SrTable({
  caption,
  rows,
}: {
  caption: string
  rows: { day: string; value: string }[]
}) {
  const { t, language } = useI18n()
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{t.stats.chartDay}</th>
          <th scope="col">{t.stats.chartKcal}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.day}>
            <th scope="row">{shortDayLabel(r.day, new Date(), language)}</th>
            <td>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** A day's kcal as the sr-table / tooltip string, honouring its flags. */
function useDayValueText() {
  const { t, n } = useI18n()
  return (d: StatDay): string => {
    if (d.kcal === null || d.isFuture) return t.stats.chartValueGap
    if (d.isToday) return t.stats.chartValueToday(n(d.kcal))
    if (d.coverage === "some") return t.stats.chartValueExcluded
    if (d.coverage === "most") return t.stats.chartValueApprox(n(d.kcal))
    return n(d.kcal)
  }
}

/* ---------------------------------------------------------------- columns */

export function WeekColumns({
  days,
  goalKcal,
  caption,
  height = 128,
  mini = false,
}: {
  days: StatDay[]
  goalKcal: number
  /** The sr-table's caption — the chart's one accessible name. */
  caption: string
  height?: number
  mini?: boolean
}) {
  const { t, n, language } = useI18n()
  const dayValue = useDayValueText()
  const width = mini ? 170 : 326
  const axis = mini ? 12 : 16
  const top = mini ? 4 : 14
  const plotH = height - axis - top
  const maxY = Math.max(goalKcal, ...days.map((d) => d.kcal ?? 0)) * 1.06 || 1
  const y = (v: number) => top + plotH - (v / maxY) * plotH
  const baseline = top + plotH
  const band = width / days.length
  const barW = Math.min(mini ? 12 : 22, band - 8)
  // The one value label the chart carries: the biggest completed bar.
  const maxDay = days.reduce<StatDay | null>(
    (best, d) =>
      countsInAverages(d) &&
      (best === null || (d.kcal as number) > (best.kcal as number))
        ? d
        : best,
    null
  )
  return (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block max-w-full"
        aria-hidden="true"
      >
        <line
          x1={0}
          x2={width}
          y1={y(goalKcal)}
          y2={y(goalKcal)}
          stroke={MUTED}
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.6}
        />
        {!mini && (
          <text
            x={width - 2}
            y={y(goalKcal) - 4}
            textAnchor="end"
            fontSize={9}
            fill={MUTED}
          >
            {t.stats.goalLine(n(goalKcal))}
          </text>
        )}
        {days.map((d, i) => {
          const cx = i * band + band / 2
          const x = cx - barW / 2
          const letter = (
            <text
              x={cx}
              y={height - 3}
              textAnchor="middle"
              fontSize={mini ? 8 : 10}
              fontWeight={d.isToday ? 700 : 400}
              fill={d.isToday ? INK : MUTED}
              opacity={d.kcal === null && !d.isToday ? 0.7 : 1}
            >
              {narrowWeekday(d.day, language)}
            </text>
          )
          const tooltip = (
            <title>{`${shortDayLabel(d.day, new Date(), language)} · ${dayValue(d)}`}</title>
          )
          if (d.kcal === null || d.isFuture) {
            return (
              <g key={d.day}>
                {tooltip}
                {!d.isFuture && <GapSlot x={x} w={barW} baseline={baseline} />}
                {letter}
              </g>
            )
          }
          if (d.coverage === "some" && !d.isToday) {
            return (
              <g key={d.day}>
                {tooltip}
                <SomeStub x={x} w={barW} baseline={baseline} />
                {letter}
              </g>
            )
          }
          const h = baseline - y(d.kcal)
          const approximate = d.coverage === "most" && !d.isToday
          return (
            <g key={d.day}>
              {tooltip}
              <path
                d={topRoundedRect(x, y(d.kcal), barW, h, 4)}
                fill={INK}
                opacity={d.isToday ? 0.4 : approximate ? 0.35 : 1}
                stroke={approximate ? INK : "none"}
                strokeWidth={approximate ? 1 : 0}
                strokeDasharray={approximate ? "3 3" : undefined}
              />
              {!mini && maxDay === d && (
                <text
                  x={cx}
                  y={y(d.kcal) - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill={MUTED}
                >
                  {n(d.kcal)}
                </text>
              )}
              {!mini && d.isToday && (
                <text
                  x={cx}
                  y={y(d.kcal) - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill={MUTED}
                >
                  {t.stats.now}
                </text>
              )}
              {letter}
            </g>
          )
        })}
      </svg>
      <SrTable
        caption={caption}
        rows={days.map((d) => ({ day: d.day, value: dayValue(d) }))}
      />
    </>
  )
}

/* ------------------------------------------------------------------ lines */

/** Split a series into contiguous segments at nulls (a gap stays a gap). */
function segments(points: { x: number; y: number | null }[]) {
  const segs: { x: number; y: number }[][] = []
  let cur: { x: number; y: number }[] = []
  for (const p of points) {
    if (p.y === null) {
      if (cur.length > 1) segs.push(cur)
      cur = []
    } else {
      cur.push(p as { x: number; y: number })
    }
  }
  if (cur.length > 1) segs.push(cur)
  return segs
}

const toPath = (seg: { x: number; y: number }[]) =>
  seg
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ")

export function TrendLine({
  days,
  avg,
  goalKcal,
  caption,
  height = 132,
}: {
  /** The drawn window, one StatDay per slot. */
  days: StatDay[]
  /** The rolling 7-day average per slot, already computed with its lead-in. */
  avg: (number | null)[]
  goalKcal: number
  caption: string
  height?: number
}) {
  const { t, n, language } = useI18n()
  const dayValue = useDayValueText()
  const width = 326
  const axis = 14
  const padL = 30
  const padR = 36
  const top = 8
  const plotW = width - padL - padR
  const plotH = height - axis - top
  // Daily marks: admitted days plus today-as-nothing; a *Some* day leaves the
  // line (excluded from the aggregate view) and gets its distinct marker below.
  const daily = days.map((d) => (countsInAverages(d) ? d.kcal : null))
  const all = [...daily, ...avg, goalKcal].filter(
    (v): v is number => v !== null
  )
  const lo = Math.min(...all) - 120
  const hi = Math.max(...all) + 120
  const x = (i: number) => padL + (i / Math.max(1, days.length - 1)) * plotW
  const y = (v: number) =>
    top + plotH - ((v - lo) / Math.max(1, hi - lo)) * plotH
  const ticks: number[] = []
  for (let v = Math.ceil(lo / 500) * 500; v < hi; v += 500) ticks.push(v)
  const avgPts = avg.map((v, i) => ({ x: x(i), y: v === null ? null : y(v) }))
  const dailyPts = daily.map((v, i) => ({
    x: x(i),
    y: v === null ? null : y(v),
  }))
  const lastIdx = avg.length - 1
  const lastAvg = avg[lastIdx]
  const mid = Math.floor(days.length / 2)
  const dateLabel = (i: number) =>
    shortDayLabel(days[i].day, new Date(), language)
  return (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block max-w-full"
        aria-hidden="true"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y(tick)}
              y2={y(tick)}
              stroke={TRACK}
              strokeWidth={1}
            />
            <text
              x={padL - 4}
              y={y(tick) + 3}
              textAnchor="end"
              fontSize={9}
              fill={MUTED}
            >
              {t.stats.kTick(n(tick / 1000))}
            </text>
          </g>
        ))}
        <line
          x1={padL}
          x2={width - padR}
          y1={y(goalKcal)}
          y2={y(goalKcal)}
          stroke={MUTED}
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.6}
        />
        {segments(dailyPts).map((seg, i) => (
          <path
            key={`d${i}`}
            d={toPath(seg)}
            fill="none"
            stroke={TAN}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {/* A *Most* day sits on the line but reads approximate: a hollow dot. */}
        {days.map((d, i) =>
          d.coverage === "most" && daily[i] !== null ? (
            <circle
              key={`m${d.day}`}
              cx={x(i)}
              cy={y(daily[i] as number)}
              r={2.5}
              fill={SURFACE}
              stroke={TAN}
              strokeWidth={1.5}
            />
          ) : null
        )}
        {/* A *Some* day is out of the aggregate but not invisible: a tan dot
            at the axis marks "tracked badly", distinct from a plain gap. */}
        {days.map((d, i) =>
          d.coverage === "some" && d.kcal !== null && !d.isToday ? (
            <circle
              key={`s${d.day}`}
              cx={x(i)}
              cy={top + plotH}
              r={2}
              fill={TAN}
            />
          ) : null
        )}
        {segments(avgPts).map((seg, i) => (
          <path
            key={`a${i}`}
            d={toPath(seg)}
            fill="none"
            stroke={INK}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {lastAvg !== null && (
          <g>
            <circle cx={x(lastIdx)} cy={y(lastAvg)} r={6.5} fill={SURFACE} />
            <circle cx={x(lastIdx)} cy={y(lastAvg)} r={4.5} fill={INK} />
            <text
              x={x(lastIdx) + 9}
              y={y(lastAvg) + 3}
              fontSize={10}
              fontWeight={600}
              fill={INK}
            >
              {n(lastAvg)}
            </text>
          </g>
        )}
        {[0, mid, days.length - 1].map((i) => (
          <text
            key={i}
            x={x(i)}
            y={height - 2}
            textAnchor={
              i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"
            }
            fontSize={9}
            fill={MUTED}
          >
            {dateLabel(i)}
          </text>
        ))}
      </svg>
      <SrTable
        caption={caption}
        rows={days.map((d) => ({ day: d.day, value: dayValue(d) }))}
      />
    </>
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
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length < 2) return null
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  const x = (i: number) => 2 + (i / (values.length - 1)) * (width - 8)
  const y = (v: number) =>
    2 + (height - 4) - ((v - lo) / Math.max(1, hi - lo)) * (height - 4)
  const pts = values.map((v, i) => ({ x: x(i), y: v === null ? null : y(v) }))
  const fromEnd = [...values].reverse().findIndex((v) => v !== null)
  const lastIdx = fromEnd === -1 ? -1 : values.length - 1 - fromEnd
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="block"
      aria-hidden="true"
    >
      {segments(pts).map((seg, i) => (
        <path
          key={i}
          d={toPath(seg)}
          fill="none"
          stroke={TAN}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      ))}
      {lastIdx >= 0 && values[lastIdx] !== null && (
        <circle
          cx={x(lastIdx)}
          cy={y(values[lastIdx] as number)}
          r={2.5}
          fill={INK}
        />
      )}
    </svg>
  )
}

/* ----------------------------------------------------------------- macros */

export function MacroStackWeek({
  days,
  caption,
  height = 124,
}: {
  days: StatDay[]
  caption: string
  height?: number
}) {
  const { t, n, language } = useI18n()
  const width = 326
  const axis = 16
  const plotH = height - axis - 4
  const baseline = 4 + plotH
  const band = width / days.length
  const barW = Math.min(22, band - 8)
  const GAP = 2
  const shareText = (d: StatDay): string => {
    const share = dayShare(d)
    if (share === null) return t.stats.chartValueGap
    if (d.coverage === "some") return t.stats.chartValueExcluded
    return t.stats.macroShareRow(
      n(Math.round(share.p * 100)),
      n(Math.round(share.f * 100)),
      n(Math.round(share.c * 100))
    )
  }
  return (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="block max-w-full"
        aria-hidden="true"
      >
        {days.map((d, i) => {
          const cx = i * band + band / 2
          const xx = cx - barW / 2
          const letter = (
            <text
              x={cx}
              y={height - 3}
              textAnchor="middle"
              fontSize={10}
              fontWeight={d.isToday ? 700 : 400}
              fill={d.isToday ? INK : MUTED}
            >
              {narrowWeekday(d.day, language)}
            </text>
          )
          const tooltip = (
            <title>{`${shortDayLabel(d.day, new Date(), language)} · ${shareText(d)}`}</title>
          )
          const share = dayShare(d)
          if (share === null || d.isFuture) {
            return (
              <g key={d.day}>
                {tooltip}
                {!d.isFuture && <GapSlot x={xx} w={barW} baseline={baseline} />}
                {letter}
              </g>
            )
          }
          if (d.coverage === "some" && !d.isToday) {
            return (
              <g key={d.day}>
                {tooltip}
                <SomeStub x={xx} w={barW} baseline={baseline} />
                {letter}
              </g>
            )
          }
          const fractions = { p: share.p, f: share.f, c: share.c }
          let yCursor = baseline
          const segs = MACROS.map((m) => {
            const h = fractions[m.key] * (plotH - GAP * 2)
            yCursor -= h
            const seg = { y: yCursor, h, color: m.mark, key: m.key }
            yCursor -= GAP
            return seg
          })
          // Today still forming and a *Most* day both read washed; the "now"
          // slot is told apart by its bold letter, like the week columns.
          const washed = d.isToday || d.coverage === "most"
          return (
            <g key={d.day} opacity={washed ? 0.55 : 1}>
              {tooltip}
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
              {letter}
            </g>
          )
        })}
      </svg>
      <SrTable
        caption={caption}
        rows={days.map((d) => ({ day: d.day, value: shareText(d) }))}
      />
    </>
  )
}

/* ------------------------------------------------------------ range dots */

export function RangeDots({
  dots,
  size = 12,
}: {
  dots: RangeDot[]
  size?: number
}) {
  const { t, language } = useI18n()
  const c = size / 2
  const stateText: Record<RangeDot["state"], string> = {
    in: t.stats.dotIn,
    out: t.stats.dotOut,
    gap: t.stats.chartValueGap,
    today: t.day.today,
    some: t.coverage.some,
    most: t.coverage.most,
    // A future day gets no mark at all — the empty slot needs no announcement.
    future: "",
  }
  return (
    <div className="flex shrink-0 items-end gap-2">
      {dots.map((dot) => (
        <div key={dot.day} className="flex flex-col items-center gap-1">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            width={size}
            height={size}
            className="block"
            role={dot.state === "future" ? undefined : "img"}
            aria-hidden={dot.state === "future" || undefined}
            aria-label={
              dot.state === "future"
                ? undefined
                : `${shortDayLabel(dot.day, new Date(), language)} · ${stateText[dot.state]}`
            }
          >
            {dot.state === "in" && (
              <circle cx={c} cy={c} r={c - 1} fill={INK} />
            )}
            {dot.state === "out" && (
              <circle
                cx={c}
                cy={c}
                r={c - 1.5}
                fill="none"
                stroke={INK}
                strokeWidth={1.5}
              />
            )}
            {dot.state === "gap" && (
              <circle
                cx={c}
                cy={c}
                r={c - 1.5}
                fill="none"
                stroke={DASH}
                strokeWidth={1}
                strokeDasharray="2.5 2.5"
              />
            )}
            {dot.state === "today" && (
              <circle cx={c} cy={c} r={2.5} fill={INK} />
            )}
            {/* Coverage marks in tan: *Some* a small solid dot (excluded but
                not a gap), *Most* a hollow ring (counted, not assessable). */}
            {dot.state === "some" && (
              <circle cx={c} cy={c} r={2.5} fill={TAN} />
            )}
            {dot.state === "most" && (
              <circle
                cx={c}
                cy={c}
                r={c - 1.5}
                fill="none"
                stroke={TAN}
                strokeWidth={1.5}
              />
            )}
          </svg>
          <span
            className="text-[9px] text-muted-foreground"
            style={{ fontWeight: dot.state === "today" ? 700 : 400 }}
            aria-hidden="true"
          >
            {narrowWeekday(dot.day, language)}
          </span>
        </div>
      ))}
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
  dashed = false,
}: {
  label: string
  value: string
  unit?: string
  note?: ReactNode
  spark?: ReactNode
  /** The quiet gated state — a dashed placeholder whose note explains the rule. */
  dashed?: boolean
}) {
  return (
    <div
      className={
        "flex min-w-0 flex-1 flex-col rounded-2xl px-3.5 py-3 " +
        (dashed
          ? "border border-dashed border-[#cbbfa4] dark:border-[#4a3e2e]"
          : "border bg-card")
      }
    >
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className="text-[22px] leading-none font-semibold">
            {value}
          </span>
          {unit && (
            <span className="text-[11px] text-muted-foreground">{unit}</span>
          )}
        </div>
        {spark}
      </div>
      {note && (
        <div className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          {note}
        </div>
      )}
    </div>
  )
}

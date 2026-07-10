// PROTOTYPE — issue #7, Variant D "Composed" (iteration 2, from reaction to A/B/C):
// Dashboard wins as the destination, WITHOUT goal-difference and monthly views.
// Its "This week" tile is tappable and opens the week report as a SUBPAGE.
// The glance strip appears on the main screen on the first open each morning —
// mocked here as a dismissible strip (✕ stands in for the once-a-day rule).
import * as React from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

import { MACROS, Shell } from "./Shell"
import {
  INK,
  MacroStackWeek,
  MUTED,
  RangeDots,
  Sparkline,
  StatTile,
  TAN,
  TrendLine,
  WeekColumns,
} from "./charts"
import {
  DAYS,
  MAX_WEEK_OFFSET,
  RANGE_HI,
  RANGE_LO,
  avgKcal,
  fmtRange,
  inRangeStats,
  inRangeStatsFor,
  lastDays,
  rolling7,
  weekSliceEnding,
} from "./data"

function GlanceStrip({ onDismiss }: { onDismiss: () => void }) {
  const week = lastDays(7)
  const avg7 = avgKcal(week)
  const avgPrev = avgKcal(DAYS.slice(-14, -7))
  const deltaPct =
    avg7 != null && avgPrev != null
      ? Math.round(((avg7 - avgPrev) / avgPrev) * 100)
      : null
  const range = inRangeStats()
  return (
    <div className="mx-1 mb-2 rounded-3xl border border-[#eee5d2] bg-[#fffdf7] px-4 py-3 shadow-[0_8px_30px_rgba(43,32,21,0.12)] dark:border-[#3a2f22] dark:bg-[#2a211a] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: MUTED }}>
          Last 7 days
        </span>
        <div className="flex items-center gap-2">
          {range.enough && (
            <span className="text-[11px]" style={{ color: MUTED }}>
              {range.inRange} of {range.tracked} in range
            </span>
          )}
          <button
            aria-label="Dismiss until tomorrow"
            onClick={onDismiss}
            className="-mr-1 flex h-6 w-6 items-center justify-center rounded-full text-[#a5988a]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-4">
        <WeekColumns days={week} width={170} height={54} mini />
        <div className="flex shrink-0 flex-col items-end">
          <div className="flex items-baseline gap-1">
            <span className="text-[20px] leading-none font-semibold">
              {avg7 == null ? "—" : avg7.toLocaleString()}
            </span>
            <span className="text-[10px]" style={{ color: MUTED }}>
              kcal avg
            </span>
          </div>
          {deltaPct != null && (
            <span className="mt-0.5 text-[10px]" style={{ color: MUTED }}>
              {deltaPct > 0 ? "↑" : "↓"} {Math.abs(deltaPct)}% vs week before
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function ScreenChrome({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#f6f1e6] text-[#2b2015] dark:bg-[#17110c] dark:text-[#f3ece2]">
      <div className="mx-auto max-w-md px-4 pb-8">
        <header className="flex items-center gap-2 pt-7 pb-4">
          <button
            aria-label="Back"
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e6dcc8] bg-[#fffdf7] text-[#7d7060] dark:border-[#3a2f22] dark:bg-[#2a211a] dark:text-[#a5988a]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-semibold whitespace-nowrap">{title}</h1>
        </header>
        {children}
      </div>
    </div>
  )
}

function Section({
  title,
  sub,
  onOpen,
  children,
}: {
  title: string
  sub?: string
  onOpen?: () => void
  children: React.ReactNode
}) {
  const head = (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {sub && (
          <p className="mt-0.5 text-[11px]" style={{ color: MUTED }}>
            {sub}
          </p>
        )}
      </div>
      {onOpen && <ChevronRight className="h-4 w-4" style={{ color: MUTED }} />}
    </div>
  )
  const body = (
    <>
      {head}
      <div className="mt-3">{children}</div>
    </>
  )
  return onOpen ? (
    <button
      onClick={onOpen}
      className="rounded-3xl border border-[#eee5d2] bg-[#fffdf7] p-4 text-left dark:border-[#3a2f22] dark:bg-[#2a211a]"
    >
      {body}
    </button>
  ) : (
    <section className="rounded-3xl border border-[#eee5d2] bg-[#fffdf7] p-4 dark:border-[#3a2f22] dark:bg-[#2a211a]">
      {body}
    </section>
  )
}

function Dashboard({
  onBack,
  onOpenWeek,
}: {
  onBack: () => void
  onOpenWeek: () => void
}) {
  const week = lastDays(7)
  const avg7 = avgKcal(week)
  const avgPrev = avgKcal(DAYS.slice(-14, -7))
  const deltaPct =
    avg7 != null && avgPrev != null
      ? Math.round(((avg7 - avgPrev) / avgPrev) * 100)
      : null
  const range = inRangeStats()
  const trend = rolling7(30)
  const weekShare = week
    .filter((d) => d.kcal != null && !d.today)
    .reduce(
      (acc, d) => {
        const kc = { p: d.p * 4, f: d.f * 9, c: d.c * 4 }
        const t = kc.p + kc.f + kc.c || 1
        return { p: acc.p + kc.p / t, f: acc.f + kc.f / t, c: acc.c + kc.c / t, n: acc.n + 1 }
      },
      { p: 0, f: 0, c: 0, n: 0 }
    )
  return (
    <ScreenChrome title="Statistics" onBack={onBack}>
      <div className="flex flex-col gap-3">
        <Section title="This week" sub="Daily calories · tap for the week report" onOpen={onOpenWeek}>
          <WeekColumns days={week} />
        </Section>

        <div className="flex gap-3">
          <StatTile
            label="7-day average"
            value={avg7 == null ? "—" : avg7.toLocaleString()}
            unit="kcal"
            note={
              deltaPct == null
                ? "tracked days only"
                : `${deltaPct > 0 ? "+" : "−"}${Math.abs(deltaPct)}% vs week before · tracked days only`
            }
            spark={<Sparkline values={rolling7(12).map((p) => p.avg)} />}
          />
          {range.enough ? (
            <StatTile
              label="In range"
              value={`${range.inRange} of ${range.tracked}`}
              unit="days"
              note={`${RANGE_LO.toLocaleString()}–${RANGE_HI.toLocaleString()} kcal (80–110% of goal)`}
            />
          ) : (
            <StatTile
              label="In range"
              value="—"
              note="shows after a week of near-daily tracking"
            />
          )}
        </div>

        <Section title="Trend" sub="Last 30 days">
          <TrendLine
            daily={lastDays(30).map((d) => (d.today ? null : d.kcal))}
            avg={trend.map((p) => p.avg)}
            dates={lastDays(30).map((d) => d.date)}
          />
          <div className="mt-2 flex items-center gap-4 text-[10px]" style={{ color: MUTED }}>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: TAN }} />
              daily
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: INK }} />
              7-day average
            </span>
          </div>
        </Section>

        <Section title="Macros" sub="Share of calories per day">
          <MacroStackWeek days={week} />
          <div className="mt-2 flex items-center gap-4 text-[10px]" style={{ color: MUTED }}>
            {MACROS.map((m) => (
              <span key={m.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                {m.label}
                {weekShare.n > 0 && (
                  <span className="tabular-nums">
                    {Math.round((weekShare[m.key] / weekShare.n) * 100)}%
                  </span>
                )}
              </span>
            ))}
          </div>
        </Section>
      </div>
    </ScreenChrome>
  )
}

function WeekReport({ onBack }: { onBack: () => void }) {
  // Week pager: 0 = the trailing 7 days, higher = further back. Arrows + swipe;
  // the oldest window is partial, so it demonstrates the gated in-range state.
  const [offset, setOffset] = React.useState(0)
  const older = () => setOffset((o) => Math.min(MAX_WEEK_OFFSET, o + 1))
  const newer = () => setOffset((o) => Math.max(0, o - 1))
  const touchX = React.useRef<number | null>(null)
  const week = weekSliceEnding(offset)
  const avg7 = avgKcal(week)
  const avgPrev = avgKcal(weekSliceEnding(offset + 1))
  const deltaPct =
    avg7 != null && avgPrev != null
      ? Math.round(((avg7 - avgPrev) / avgPrev) * 100)
      : null
  const range = inRangeStatsFor(week)
  return (
    <ScreenChrome title="Week report" onBack={onBack}>
      {/* Week selector — one wide pill with borderless chevrons, deliberately a
          different shape from the circled back button (screen nav vs content nav). */}
      <div className="mb-4 flex items-center justify-between rounded-full border border-[#eee5d2] bg-[#fffdf7] px-1 py-1 dark:border-[#3a2f22] dark:bg-[#2a211a]">
        <button
          aria-label="Older week"
          onClick={older}
          disabled={offset >= MAX_WEEK_OFFSET}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#7d7060] disabled:opacity-30 dark:text-[#a5988a]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[13px] font-semibold">
          {offset === 0 ? "This week" : fmtRange(week)}
        </span>
        <button
          aria-label="Newer week"
          onClick={newer}
          disabled={offset === 0}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#7d7060] disabled:opacity-30 dark:text-[#a5988a]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div
        className="px-1"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current == null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (dx > 48) older()
          if (dx < -48) newer()
        }}
      >
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[44px] leading-none font-semibold">
              {avg7 == null ? "—" : avg7.toLocaleString()}
            </span>
            <span className="text-[13px]" style={{ color: MUTED }}>
              kcal / day
            </span>
          </div>
          <p className="mt-1.5 text-[13px]" style={{ color: MUTED }}>
            7-day average
            {deltaPct != null && (
              <>
                {" · "}
                {deltaPct > 0 ? "up" : "down"} {Math.abs(deltaPct)}% on the week
                before
              </>
            )}
          </p>
        </div>

        <div className="mt-6">
          <WeekColumns days={week} height={140} />
        </div>

        {range.enough ? (
          <div className="mt-6 flex items-center justify-between gap-3 rounded-3xl border border-[#eee5d2] bg-[#fffdf7] px-4 py-3.5 dark:border-[#3a2f22] dark:bg-[#2a211a]">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">
                {range.inRange} of {range.tracked} days in range
              </div>
              <div className="mt-0.5 text-[11px]" style={{ color: MUTED }}>
                {RANGE_LO.toLocaleString()}–{RANGE_HI.toLocaleString()} kcal (80–110% of goal)
              </div>
            </div>
            <RangeDots days={range.days} />
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-[#cbbfa4] px-4 py-3.5 dark:border-[#4a3e2e]">
            <div className="text-[13px] font-semibold" style={{ color: MUTED }}>
              In range
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: MUTED }}>
              Shows after a week of near-daily tracking — {range.tracked} of 7
              days tracked in this window.
            </div>
          </div>
        )}

        <p className="mt-4 text-[11px]" style={{ color: MUTED }}>
          Untracked days are left out of averages.
        </p>
      </div>
    </ScreenChrome>
  )
}

export function VariantComposed() {
  const [screen, setScreen] = React.useState<"none" | "dashboard" | "report">(
    "dashboard"
  )
  // ✕ stands in for the real rule: the strip shows on the first open each morning.
  const [stripVisible, setStripVisible] = React.useState(true)
  return (
    <>
      <Shell
        onStats={() => setScreen("dashboard")}
        aboveSummary={
          stripVisible ? (
            <GlanceStrip onDismiss={() => setStripVisible(false)} />
          ) : undefined
        }
      />
      {screen === "dashboard" && (
        <Dashboard
          onBack={() => setScreen("none")}
          onOpenWeek={() => setScreen("report")}
        />
      )}
      {screen === "report" && <WeekReport onBack={() => setScreen("dashboard")} />}
    </>
  )
}

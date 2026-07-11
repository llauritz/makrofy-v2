import { WEEK } from "./mock"

// Seven day-chips ending in exactly one future day (dashed + dimmed). Today is
// ink-inverted; a dot marks days with entries. Static until #15 wires day nav.
export function WeekStrip() {
  return (
    <div className="flex justify-between px-4 py-2">
      {WEEK.map((day) => (
        <button
          key={day.day}
          className={
            "flex w-11 flex-col items-center gap-0.5 rounded-full py-2 " +
            (day.today
              ? "bg-foreground text-background"
              : day.future
                ? "border border-dashed border-[#cbbfa4] opacity-60 dark:border-[#4a3e2e]"
                : "")
          }
        >
          <span
            className={
              "text-[10px] " +
              (day.today ? "opacity-70" : "text-muted-foreground")
            }
          >
            {day.weekday}
          </span>
          <span className="text-sm font-semibold tabular-nums">{day.day}</span>
          <span
            className={
              "h-1 w-1 rounded-full " +
              (day.logged
                ? day.today
                  ? "bg-background/70"
                  : "bg-[#b9ab92] dark:bg-[#5a4c3b]"
                : "bg-transparent")
            }
          />
        </button>
      ))}
    </div>
  )
}

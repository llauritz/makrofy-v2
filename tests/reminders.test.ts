// Seam: the reminder schedule (src/lib/reminders.ts, ADR 0013). The native
// layer only replays the plan this computes, so every rule lives here: which
// times and Days get a notification, the smart skip, and how stored settings
// are read back. Plain Node, a fixed clock.
import { describe, expect, it } from "vitest"

import {
  DEFAULT_REMINDER_SETTINGS,
  MAX_REMINDERS,
  nextReminderTime,
  normalizeTimes,
  parseReminderSettings,
  planReminders,
  planSignature,
  REMINDER_ID_BASE,
  REMINDER_ID_SPAN,
  REMINDER_HORIZON_DAYS,
  reminderMeal,
  serializeReminderSettings,
  type ReminderSettings,
} from "@/lib/reminders"

const on = (times: string[], smartSkip = true): ReminderSettings => ({
  enabled: true,
  times,
  smartSkip,
})
// 2026-03-10 10:00 local.
const NOW = new Date(2026, 2, 10, 10, 0)
const at = (h: number, m = 0, dayOffset = 0) =>
  new Date(2026, 2, 10 + dayOffset, h, m).getTime()

describe("planReminders", () => {
  it("schedules nothing while switched off", () => {
    expect(planReminders({ ...on(["13:00"]), enabled: false }, NOW, [])).toEqual([])
  })

  it("skips times already past today and fills the horizon", () => {
    const plan = planReminders(on(["08:30", "13:00"]), NOW, [], 3)
    expect(plan.map((r) => r.at.getTime())).toEqual([
      at(13), // 08:30 today has passed
      at(8, 30, 1),
      at(13, 0, 1),
      at(8, 30, 2),
      at(13, 0, 2),
    ])
  })

  it("names each reminder by the meal its time falls in", () => {
    const plan = planReminders(on(["13:00", "19:30", "23:00"]), NOW, [], 1)
    expect(plan.map((r) => r.meal)).toEqual(["lunch", "dinner", "snack"])
  })

  it("smart skip drops today's reminder once an Entry lands in its window", () => {
    // 08:30 and 13:00: the 13:00 window runs from 08:30.
    const plan = planReminders(on(["08:30", "13:00"]), NOW, [at(9, 45)], 2)
    expect(plan.map((r) => r.at.getTime())).toEqual([at(8, 30, 1), at(13, 0, 1)])
  })

  it("an Entry before the previous reminder doesn't count for the next one", () => {
    const plan = planReminders(on(["08:30", "13:00"]), NOW, [at(8, 0)], 1)
    expect(plan.map((r) => r.at.getTime())).toEqual([at(13)])
  })

  it("the first reminder's window opens at midnight", () => {
    const early = new Date(2026, 2, 10, 6, 0)
    const plan = planReminders(on(["08:30"]), early, [at(0, 30)], 1)
    expect(plan).toEqual([])
  })

  it("never skips future Days, and not at all with smart skip off", () => {
    const logged = [at(11)]
    expect(planReminders(on(["13:00"], false), NOW, logged, 2)).toHaveLength(2)
    expect(planReminders(on(["13:00"]), NOW, logged, 2).map((r) => r.at.getTime())).toEqual([
      at(13, 0, 1),
    ])
  })

  it("keeps ids unique and inside the reserved range at full size", () => {
    const times = ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"]
    const plan = planReminders(on(times), new Date(2026, 2, 10, 0, 0), [])
    expect(plan).toHaveLength(MAX_REMINDERS * REMINDER_HORIZON_DAYS)
    const ids = new Set(plan.map((r) => r.id))
    expect(ids.size).toBe(plan.length)
    for (const id of ids) {
      expect(id).toBeGreaterThanOrEqual(REMINDER_ID_BASE)
      expect(id).toBeLessThan(REMINDER_ID_BASE + REMINDER_ID_SPAN)
    }
  })

  it("lands on the wall-clock time across a DST change", () => {
    // Whatever the test machine's zone, each reminder keeps its local time.
    const plan = planReminders(on(["08:30"]), new Date(2026, 2, 27, 12, 0), [], 4)
    for (const r of plan) {
      expect([r.at.getHours(), r.at.getMinutes()]).toEqual([8, 30])
    }
  })
})

describe("settings storage", () => {
  it("defaults to off with the three meal times and smart skip on", () => {
    expect(parseReminderSettings(null)).toEqual(DEFAULT_REMINDER_SETTINGS)
    expect(DEFAULT_REMINDER_SETTINGS.enabled).toBe(false)
  })

  it("round-trips", () => {
    const s = on(["19:30", "08:30"], false)
    expect(parseReminderSettings(serializeReminderSettings(s))).toEqual(
      on(["08:30", "19:30"], false),
    )
  })

  it("reads corrupt values as off", () => {
    expect(parseReminderSettings("{nope").enabled).toBe(false)
    expect(parseReminderSettings('{"enabled":"yes"}').enabled).toBe(false)
    expect(parseReminderSettings('"x"')).toEqual(DEFAULT_REMINDER_SETTINGS)
  })

  it("keeps an emptied list empty", () => {
    expect(parseReminderSettings('{"enabled":true,"times":[]}').times).toEqual([])
  })
})

describe("normalizeTimes", () => {
  it("sorts, de-duplicates, drops invalid and caps", () => {
    expect(normalizeTimes(["13:00", "08:30", "13:00", "25:00", "7:00", 5])).toEqual([
      "08:30",
      "13:00",
    ])
    const many = ["01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00"]
    expect(normalizeTimes(many)).toHaveLength(MAX_REMINDERS)
  })
})

describe("nextReminderTime", () => {
  it("offers an hour after the latest, wrapping past midnight", () => {
    expect(nextReminderTime(["08:30", "13:00"])).toBe("14:00")
    expect(nextReminderTime(["23:30"])).toBe("00:30")
    expect(nextReminderTime([])).toBe("12:00")
  })

  it("is null once full", () => {
    expect(
      nextReminderTime(["01:00", "02:00", "03:00", "04:00", "05:00", "06:00"]),
    ).toBeNull()
  })
})

describe("reminderMeal / planSignature", () => {
  it("uses the Entry meal windows", () => {
    expect(reminderMeal("08:30")).toBe("breakfast")
    expect(reminderMeal("16:00")).toBe("snack")
  })

  it("changes with the plan and the copy", () => {
    const plan = planReminders(on(["13:00"]), NOW, [], 1)
    expect(planSignature(plan, "en")).not.toBe(planSignature(plan, "es"))
    expect(planSignature(plan, "en")).not.toBe(planSignature([], "en"))
  })
})

// STATIC MOCK (issue #13): the shell renders this fixed day until the Firestore
// store lands (#14) and the manual-entry slice replaces it (#15). Same day the
// design-direction record screenshots were captured with (issue #4).
// Realism: most entries are kcal-only; one 0-kcal entry exercises the dashed state.

export const GOAL_KCAL = 2200

export type MockEntry = {
  id: string
  label: string
  kcal: number
  p: number
  f: number
  c: number
}

export const ENTRIES: MockEntry[] = [
  {
    id: "e1",
    label: "Oatmeal with blueberries",
    kcal: 320,
    p: 12,
    f: 7,
    c: 54,
  },
  { id: "e2", label: "Cappuccino", kcal: 90, p: 0, f: 0, c: 0 },
  { id: "e3", label: "Chicken caesar wrap", kcal: 540, p: 38, f: 0, c: 0 },
  { id: "e4", label: "Musly", kcal: 0, p: 0, f: 0, c: 0 },
  { id: "e5", label: "Greek yogurt with honey", kcal: 150, p: 15, f: 0, c: 0 },
  { id: "e6", label: "Salmon, rice & greens", kcal: 620, p: 42, f: 22, c: 58 },
  {
    id: "e7",
    label: "Dark chocolate (2 squares)",
    kcal: 110,
    p: 0,
    f: 0,
    c: 0,
  },
]

export type MockDay = {
  weekday: string
  day: number
  logged?: boolean
  today?: boolean
  future?: boolean
}

// Exactly one future day at the end (dashed + dimmed in the strip).
export const WEEK: MockDay[] = [
  { weekday: "S", day: 5, logged: true },
  { weekday: "M", day: 6, logged: true },
  { weekday: "T", day: 7 },
  { weekday: "W", day: 8, logged: true },
  { weekday: "T", day: 9, logged: true },
  { weekday: "F", day: 10, logged: true, today: true },
  { weekday: "S", day: 11, future: true },
]

export const TOTALS = ENTRIES.reduce(
  (acc, e) => ({
    kcal: acc.kcal + e.kcal,
    p: acc.p + e.p,
    f: acc.f + e.f,
    c: acc.c + e.c,
  }),
  { kcal: 0, p: 0, f: 0, c: 0 }
)

export const REMAINING = GOAL_KCAL - TOTALS.kcal

export const PCT_OF_GOAL = Math.round((TOTALS.kcal / GOAL_KCAL) * 100)

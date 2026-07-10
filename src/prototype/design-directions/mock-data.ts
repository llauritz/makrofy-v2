// PROTOTYPE — throwaway mock data for issue #4 (visual design directions).
// One realistic logged day, shared by all variants. No persistence.
// Realism note (user feedback): most entries are calories-only; macros are the
// exception. One 0-kcal entry exercises V1's dashed "no calories" state.

export const GOAL_KCAL = 2200

export type MockEntry = {
  id: string
  time: string
  label: string
  kcal: number
  p: number
  c: number
  f: number
}

export const ENTRIES: MockEntry[] = [
  {
    id: "e1",
    time: "07:45",
    label: "Oatmeal with blueberries",
    kcal: 320,
    p: 12,
    c: 54,
    f: 7,
  },
  { id: "e2", time: "08:10", label: "Cappuccino", kcal: 90, p: 0, c: 0, f: 0 },
  {
    id: "e3",
    time: "12:30",
    label: "Chicken caesar wrap",
    kcal: 540,
    p: 38,
    c: 0,
    f: 0,
  },
  { id: "e4", time: "10:15", label: "Musly", kcal: 0, p: 0, c: 0, f: 0 },
  {
    id: "e5",
    time: "16:30",
    label: "Greek yogurt with honey",
    kcal: 150,
    p: 15,
    c: 0,
    f: 0,
  },
  {
    id: "e6",
    time: "19:15",
    label: "Salmon, rice & greens",
    kcal: 620,
    p: 42,
    c: 58,
    f: 22,
  },
  {
    id: "e7",
    time: "21:00",
    label: "Dark chocolate (2 squares)",
    kcal: 110,
    p: 0,
    c: 0,
    f: 0,
  },
]

export const TOTALS = ENTRIES.reduce(
  (acc, e) => ({
    kcal: acc.kcal + e.kcal,
    p: acc.p + e.p,
    c: acc.c + e.c,
    f: acc.f + e.f,
  }),
  { kcal: 0, p: 0, c: 0, f: 0 }
)

export const REMAINING = GOAL_KCAL - TOTALS.kcal

export const PCT_OF_GOAL = Math.round((TOTALS.kcal / GOAL_KCAL) * 100)

// Soft reference targets for macro meters — visual prototype only, not a product decision.
export const MACRO_REF = { p: 130, c: 250, f: 75 }

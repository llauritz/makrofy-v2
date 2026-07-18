// @vitest-environment jsdom
// Seam: the data hooks' first render during launch (issue #69). Until Firebase
// Auth settles (a blocking server round-trip when online), no listener can
// deliver — so the hooks must seed their initial state from the boot mirror,
// and hand over to the live values the moment the SDK speaks. The mirror
// module and the auth SDK are the external systems here, stubbed at their
// module boundaries; the hooks' observable values are what's under test.
import { Timestamp } from "firebase/firestore"
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { BootMirror } from "@/data/boot-mirror"
import type { Entry } from "@/data/entries"

// What readBootMirror serves this test file; null = nothing mirrored.
const state = vi.hoisted(() => ({
  mirror: null as unknown,
  authCallbacks: [] as Array<(user: { uid: string } | null) => void>,
}))

vi.mock("@/lib/firebase", () => ({ app: {}, db: {}, auth: { currentUser: null } }))
vi.mock("@/data/boot-mirror", () => ({
  readBootMirror: () => state.mirror,
}))
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (
    _auth: unknown,
    cb: (user: { uid: string } | null) => void,
  ) => {
    state.authCallbacks.push(cb)
    return () => {}
  },
  onIdTokenChanged: () => () => {},
}))
vi.mock("@/data/entries", () => ({
  listenToDay: () => () => {},
  listenToAllEntries: () => () => {},
  listenToSyncMetadata: () => () => {},
}))
vi.mock("@/data/goal", () => ({
  listenToGoal: () => () => {},
}))
vi.mock("@/data/products", () => ({
  listenToOverlays: () => () => {},
}))

import { useDay, useGoal, useGoalStatus, useIdentity } from "@/data/hooks"

function entry(label: string): Entry {
  return {
    id: `e-${label}`,
    date: "2026-07-17",
    label,
    kcal: 300,
    mealType: "breakfast",
    source: "manual",
    createdAt: Timestamp.fromMillis(1_000),
    updatedAt: Timestamp.fromMillis(1_000),
  }
}

function mirror(overrides: Partial<BootMirror> = {}): BootMirror {
  return {
    uid: "mirror-uid",
    goal: { kcal: 2100 },
    day: "2026-07-17",
    entries: [entry("porridge")],
    ...overrides,
  }
}

afterEach(() => {
  state.mirror = null
  state.authCallbacks = []
})

describe("useIdentity", () => {
  it("seeds the mirrored uid before auth settles", () => {
    state.mirror = mirror()
    const { result } = renderHook(() => useIdentity())
    expect(result.current).toBe("mirror-uid")
  })

  it("stays null on a first-ever launch with nothing mirrored", () => {
    const { result } = renderHook(() => useIdentity())
    expect(result.current).toBeNull()
  })

  it("hands over to the settled auth state, even when it disagrees", () => {
    state.mirror = mirror()
    const { result } = renderHook(() => useIdentity())
    act(() => state.authCallbacks.forEach((cb) => cb({ uid: "settled-uid" })))
    expect(result.current).toBe("settled-uid")
    act(() => state.authCallbacks.forEach((cb) => cb(null)))
    expect(result.current).toBeNull()
  })
})

describe("useGoalStatus", () => {
  it("resolves from the mirror when the uid matches", () => {
    state.mirror = mirror()
    const { result } = renderHook(() => useGoalStatus("mirror-uid"))
    expect(result.current).toBe("set")
  })

  it("mirrored null Goal reads as unset, not loading", () => {
    state.mirror = mirror({ goal: null })
    const { result } = renderHook(() => useGoalStatus("mirror-uid"))
    expect(result.current).toBe("unset")
  })

  it("stays loading for a uid the mirror does not cover", () => {
    state.mirror = mirror()
    const { result } = renderHook(() => useGoalStatus("other-uid"))
    expect(result.current).toBe("loading")
  })
})

describe("useGoal", () => {
  it("seeds the mirrored Goal when the uid matches", () => {
    state.mirror = mirror()
    const { result } = renderHook(() => useGoal("mirror-uid"))
    expect(result.current).toEqual({ kcal: 2100 })
  })

  it("stays null for a uid the mirror does not cover", () => {
    state.mirror = mirror()
    const { result } = renderHook(() => useGoal("other-uid"))
    expect(result.current).toBeNull()
  })
})

describe("useDay", () => {
  it("seeds the mirrored Entries for the mirrored Day and uid", () => {
    state.mirror = mirror()
    const { result } = renderHook(() => useDay("mirror-uid", "2026-07-17"))
    expect(result.current.map((e) => e.label)).toEqual(["porridge"])
  })

  it("seeds nothing for a different Day — a new day starts empty", () => {
    state.mirror = mirror()
    const { result } = renderHook(() => useDay("mirror-uid", "2026-07-18"))
    expect(result.current).toEqual([])
  })

  it("seeds nothing for a uid the mirror does not cover", () => {
    state.mirror = mirror()
    const { result } = renderHook(() => useDay("other-uid", "2026-07-17"))
    expect(result.current).toEqual([])
  })
})

// Seam: the resume reconnect — returning to the app after a real absence
// cycles Firestore's network so a silently dead listen stream can't hold the
// log on stale data. The SDK's network switches are the external system here,
// stubbed at the module boundary; which visibility sequences trigger a cycle
// is what's under test.
import { beforeEach, describe, expect, it, vi } from "vitest"

const calls = vi.hoisted(() => [] as string[])
vi.mock("firebase/firestore", () => ({
  disableNetwork: async () => void calls.push("disable"),
  enableNetwork: async () => void calls.push("enable"),
}))

import type { Firestore } from "firebase/firestore"
import {
  RESUME_REFRESH_AFTER_MS,
  refreshOnResume,
  type ResumeEnv,
} from "@/data/resume-sync"

function fakeEnv() {
  let visibility: DocumentVisibilityState = "visible"
  let listener: (() => void) | undefined
  const env = {
    now: 0,
    online: true,
    document: {
      get visibilityState() {
        return visibility
      },
      addEventListener: (_: string, cb: () => void) => void (listener = cb),
      removeEventListener: () => void (listener = undefined),
    },
    isOnline: () => env.online,
    nowFn: () => env.now,
    set(state: DocumentVisibilityState) {
      visibility = state
      listener?.()
    },
  }
  return env
}

const db = {} as Firestore
const flush = () => new Promise((r) => setTimeout(r, 0))

function start(env: ReturnType<typeof fakeEnv>) {
  return refreshOnResume(db, {
    document: env.document as unknown as ResumeEnv["document"],
    isOnline: env.isOnline,
    now: env.nowFn,
  })
}

beforeEach(() => {
  calls.length = 0
})

describe("refreshOnResume", () => {
  it("cycles the network after a long absence", async () => {
    const env = fakeEnv()
    start(env)
    env.set("hidden")
    env.now += RESUME_REFRESH_AFTER_MS
    env.set("visible")
    await flush()
    expect(calls).toEqual(["disable", "enable"])
  })

  it("leaves the stream alone after a quick app switch", async () => {
    const env = fakeEnv()
    start(env)
    env.set("hidden")
    env.now += RESUME_REFRESH_AFTER_MS - 1
    env.set("visible")
    await flush()
    expect(calls).toEqual([])
  })

  it("does nothing when returning offline", async () => {
    const env = fakeEnv()
    start(env)
    env.set("hidden")
    env.now += RESUME_REFRESH_AFTER_MS * 2
    env.online = false
    env.set("visible")
    await flush()
    expect(calls).toEqual([])
  })

  it("does nothing on a visible event with no absence before it", async () => {
    const env = fakeEnv()
    start(env)
    env.now += RESUME_REFRESH_AFTER_MS * 2
    env.set("visible")
    await flush()
    expect(calls).toEqual([])
  })

  it("stops watching once disposed", async () => {
    const env = fakeEnv()
    const stop = start(env)
    stop()
    env.set("hidden")
    env.now += RESUME_REFRESH_AFTER_MS * 2
    env.set("visible")
    await flush()
    expect(calls).toEqual([])
  })
})

// Seam: the header sync indicator's state machine — which of silent / pending /
// attention applies, read purely from Firestore snapshot metadata plus whether
// the identity's token has lapsed (spec § PWA & offline; issue #19). No Firebase
// here: the resolver is a pure function so every state is cheap to pin down.
import { describe, expect, it } from "vitest"
import {
  resolveSyncStatus,
  revealDelayMs,
  SLOW_SYNC_MS,
  SYNC_SETTLE_MS,
} from "@/lib/sync"

const online = { hasPendingWrites: false, fromCache: false }
const offline = { hasPendingWrites: false, fromCache: true }
const queued = { hasPendingWrites: true, fromCache: false }
const stuck = { hasPendingWrites: true, fromCache: true }
const ok = { authExpired: false }
const expired = { authExpired: true }

describe("resolveSyncStatus", () => {
  it("is silent when everything is synced", () => {
    expect(resolveSyncStatus(online, ok)).toBe("synced")
  })

  it("is pending when offline, even with nothing queued", () => {
    expect(resolveSyncStatus(offline, ok)).toBe("pending")
  })

  it("is pending when local writes are still queued", () => {
    expect(resolveSyncStatus(queued, ok)).toBe("pending")
  })

  it("collapses offline and queued writes into the one pending state", () => {
    expect(resolveSyncStatus(stuck, ok)).toBe("pending")
  })

  it("is attention when the identity's token has lapsed", () => {
    expect(resolveSyncStatus(stuck, expired)).toBe("attention")
  })

  it("lets an expired token outrank an otherwise-synced snapshot", () => {
    // authExpired is only ever set during a real write pause, but the resolver
    // must not be the thing that swallows it — a tap here re-auths, not explains.
    expect(resolveSyncStatus(online, expired)).toBe("attention")
  })
})

describe("revealDelayMs", () => {
  it("shows synced at once", () => {
    expect(revealDelayMs("synced", { online: true })).toBe(0)
    expect(revealDelayMs("synced", { online: false })).toBe(0)
  })

  it("waits only the short settle for attention, online or not", () => {
    expect(revealDelayMs("attention", { online: true })).toBe(SYNC_SETTLE_MS)
    expect(revealDelayMs("attention", { online: false })).toBe(SYNC_SETTLE_MS)
  })

  it("surfaces pending quickly when the device is offline", () => {
    expect(revealDelayMs("pending", { online: false })).toBe(SYNC_SETTLE_MS)
  })

  it("holds pending back much longer while a connection is up", () => {
    // A slow phone launch's cache→server hop runs past the short settle; that
    // must not flash the offline cloud.
    expect(revealDelayMs("pending", { online: true })).toBe(SLOW_SYNC_MS)
    expect(SLOW_SYNC_MS).toBeGreaterThan(5 * SYNC_SETTLE_MS)
  })
})

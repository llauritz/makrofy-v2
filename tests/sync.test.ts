// Seam: the header sync indicator's state machine — which of silent / pending /
// attention applies, read purely from Firestore snapshot metadata plus whether
// the identity's token has lapsed (spec § PWA & offline; issue #19). No Firebase
// here: the resolver is a pure function so every state is cheap to pin down.
import { describe, expect, it } from "vitest"
import { resolveSyncStatus } from "@/lib/sync"

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

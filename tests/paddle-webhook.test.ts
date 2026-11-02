// Seam: Paddle → entitlement doc (ADR 0012). The pure decision (which plan,
// when the cycle anchor moves, which events lose) and the signature check run
// without Firebase; the transactional writer runs against the emulator through
// the Admin SDK, exactly as the deployed function does.
import { createHmac } from "node:crypto"
import { deleteApp, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  leadSubscription,
  nextEntitlement,
  uidOf,
  type Entitlement,
  type PaddleSubscription,
} from "../functions/src/entitlement"
import { PADDLE, planForPrice } from "../functions/src/paddle-config"
import { verifyPaddleSignature } from "../functions/src/signature"
import { applyPaddleEvent, type PaddleEvent } from "../functions/src/webhook"
import { clearFirestoreData } from "./emulator"

PADDLE.prices = {
  pro: { monthly: "pri_pro_m", annual: "pri_pro_y" },
  unlimited: { monthly: "pri_unl_m", annual: "pri_unl_y" },
}

const T0 = new Date("2026-11-01T10:00:00Z")
const later = (days: number) => new Date(T0.getTime() + days * 86_400_000)

function sub(over: Partial<PaddleSubscription> = {}): PaddleSubscription {
  return {
    id: "sub_1",
    status: "active",
    customer_id: "ctm_1",
    custom_data: { uid: "alice" },
    items: [{ price: { id: "pri_pro_y" } }],
    current_billing_period: {
      starts_at: T0.toISOString(),
      ends_at: later(365).toISOString(),
    },
    scheduled_change: null,
    ...over,
  }
}

function written(d: ReturnType<typeof nextEntitlement>): Entitlement {
  if (d.kind !== "write") throw new Error(`expected a write, got ${d.reason}`)
  return d.entitlement
}

describe("planForPrice", () => {
  it("maps each of the four prices and nothing else", () => {
    expect(planForPrice("pri_pro_m")).toEqual({ plan: "pro", billing: "monthly" })
    expect(planForPrice("pri_unl_y")).toEqual({ plan: "unlimited", billing: "annual" })
    expect(planForPrice("pri_other")).toBeNull()
    expect(planForPrice("")).toBeNull()
  })
})

describe("nextEntitlement", () => {
  it("a purchase starts the paid plan and anchors the cycle on it", () => {
    const e = written(nextEntitlement(null, sub(), T0))
    expect(e.plan).toBe("pro")
    expect(e.billing).toBe("annual")
    expect(e.planStartedAt).toEqual(T0)
    expect(e.currentPeriodEnd).toEqual(later(365))
    expect(e.cancelsAt).toBeNull()
  })

  it("a renewal keeps the cycle anchor", () => {
    const first = written(nextEntitlement(null, sub(), T0))
    const renewed = written(nextEntitlement(first, sub(), later(365)))
    expect(renewed.planStartedAt).toEqual(T0)
  })

  it("an upgrade re-anchors with a full allowance", () => {
    const first = written(nextEntitlement(null, sub(), T0))
    const up = written(
      nextEntitlement(first, sub({ items: [{ price: { id: "pri_unl_m" } }] }), later(3)),
    )
    expect(up.plan).toBe("unlimited")
    expect(up.planStartedAt).toEqual(later(3))
  })

  it("a scheduled cancel keeps the plan and records the end date", () => {
    const first = written(nextEntitlement(null, sub(), T0))
    const e = written(
      nextEntitlement(
        first,
        sub({ scheduled_change: { action: "cancel", effective_at: later(365).toISOString() } }),
        later(10),
      ),
    )
    expect(e.plan).toBe("pro")
    expect(e.cancelsAt).toEqual(later(365))
    expect(e.planStartedAt).toEqual(T0)
  })

  it("past_due keeps the plan while Paddle retries the card", () => {
    const first = written(nextEntitlement(null, sub(), T0))
    expect(written(nextEntitlement(first, sub({ status: "past_due" }), later(30))).plan).toBe(
      "pro",
    )
  })

  it("canceled or paused lapses to free and re-anchors", () => {
    const first = written(nextEntitlement(null, sub(), T0))
    for (const status of ["canceled", "paused"] as const) {
      const e = written(
        nextEntitlement(first, sub({ status, current_billing_period: null }), later(40)),
      )
      expect(e.plan).toBe("free")
      expect(e.billing).toBeNull()
      expect(e.planStartedAt).toEqual(later(40))
    }
  })

  it("ignores an event older than the one already applied", () => {
    const first = written(nextEntitlement(null, sub(), later(5)))
    const d = nextEntitlement(first, sub({ status: "canceled" }), later(4))
    expect(d.kind).toBe("skip")
  })

  it("a second subscription's cancel doesn't knock out the paying one", () => {
    const paying = written(nextEntitlement(null, sub({ id: "sub_2" }), T0))
    const d = nextEntitlement(paying, sub({ id: "sub_1", status: "canceled" }), later(1))
    expect(d.kind).toBe("skip")
  })

  it("refuses a paid subscription on an unknown price", () => {
    expect(() =>
      nextEntitlement(null, sub({ items: [{ price: { id: "pri_mystery" } }] }), T0),
    ).toThrow(/unknown price/)
  })

  it("reads the uid only from well-formed custom data", () => {
    expect(uidOf(sub())).toBe("alice")
    expect(uidOf(sub({ custom_data: null }))).toBeNull()
    expect(uidOf(sub({ custom_data: { uid: "../etc" } }))).toBeNull()
    expect(uidOf(sub({ custom_data: { uid: 42 } }))).toBeNull()
  })
})

describe("leadSubscription", () => {
  const pro = sub({ id: "sub_pro" })
  const unl = sub({ id: "sub_unl", items: [{ price: { id: "pri_unl_m" } }] })

  it("follows the highest plan still paying", () => {
    const lead = leadSubscription({ sub: pro, occurredAt: later(5) }, [
      { sub: unl, occurredAt: later(1) },
    ])
    expect(lead.sub.id).toBe("sub_unl")
  })

  it("falls back to the other subscription when the changed one lapses", () => {
    const lead = leadSubscription(
      { sub: { ...unl, status: "canceled" }, occurredAt: later(5) },
      [{ sub: pro, occurredAt: T0 }],
    )
    expect(lead.sub.id).toBe("sub_pro")
  })

  it("prefers the newer of two on the same plan, and the changed one when none pays", () => {
    const older = sub({ id: "sub_a" })
    const newer = sub({ id: "sub_b" })
    expect(
      leadSubscription({ sub: older, occurredAt: T0 }, [{ sub: newer, occurredAt: later(1) }]).sub
        .id,
    ).toBe("sub_b")
    const gone = { sub: { ...older, status: "canceled" as const }, occurredAt: later(2) }
    expect(
      leadSubscription(gone, [{ sub: { ...newer, status: "paused" }, occurredAt: later(1) }]).sub
        .id,
    ).toBe("sub_a")
  })
})

describe("verifyPaddleSignature", () => {
  const secret = "pdl_ntfset_test"
  const body = '{"event_id":"evt_1"}'
  const now = 1_793_000_000_000
  const sign = (ts: number, payload = body, key = secret) =>
    createHmac("sha256", key).update(`${ts}:${payload}`).digest("hex")
  const ts = Math.floor(now / 1000)

  it("accepts a fresh, correct signature", () => {
    expect(verifyPaddleSignature(`ts=${ts};h1=${sign(ts)}`, Buffer.from(body), secret, now)).toBe(
      true,
    )
  })

  it("accepts any matching h1 during a secret rotation", () => {
    const header = `ts=${ts};h1=${sign(ts, body, "old")};h1=${sign(ts)}`
    expect(verifyPaddleSignature(header, body, secret, now)).toBe(true)
  })

  it("rejects a tampered body, a wrong key, an old timestamp, or junk", () => {
    expect(verifyPaddleSignature(`ts=${ts};h1=${sign(ts)}`, body + " ", secret, now)).toBe(false)
    expect(verifyPaddleSignature(`ts=${ts};h1=${sign(ts, body, "x")}`, body, secret, now)).toBe(
      false,
    )
    const old = ts - 600
    expect(verifyPaddleSignature(`ts=${old};h1=${sign(old)}`, body, secret, now)).toBe(false)
    expect(verifyPaddleSignature(undefined, body, secret, now)).toBe(false)
    expect(verifyPaddleSignature("nonsense", body, secret, now)).toBe(false)
    expect(verifyPaddleSignature(`ts=${ts};h1=zz`, body, secret, now)).toBe(false)
  })
})

describe("applyPaddleEvent (emulator)", () => {
  let app: App
  let db: Firestore

  beforeAll(() => {
    app = initializeApp({ projectId: "goyaffle" }, "paddle-webhook-test")
    db = getFirestore(app)
  })
  afterAll(async () => {
    await deleteApp(app)
  })
  beforeEach(async () => {
    await clearFirestoreData()
  })

  const event = (id: string, type: string, at: Date, data: PaddleSubscription): PaddleEvent => ({
    event_id: id,
    event_type: type,
    occurred_at: at.toISOString(),
    data,
  })
  const read = async () =>
    (await db.doc("users/alice/settings/subscription").get()).data() as
      | Record<string, unknown>
      | undefined

  it("writes the plan onto the user and applies each event once", async () => {
    expect(await applyPaddleEvent(db, event("evt_1", "subscription.created", T0, sub()))).toBe(
      "applied",
    )
    expect(await applyPaddleEvent(db, event("evt_1", "subscription.created", T0, sub()))).toBe(
      "duplicate",
    )
    const doc = await read()
    expect(doc?.plan).toBe("pro")
    expect(doc?.customerId).toBe("ctm_1")
    expect((doc?.planStartedAt as Timestamp).toDate()).toEqual(T0)
    const log = await db.doc("paddleEvents/evt_1").get()
    expect(log.data()?.uid).toBe("alice")
  })

  it("lapses to free on cancel", async () => {
    await applyPaddleEvent(db, event("evt_1", "subscription.created", T0, sub()))
    await applyPaddleEvent(
      db,
      event(
        "evt_2",
        "subscription.canceled",
        later(30),
        sub({ status: "canceled", current_billing_period: null }),
      ),
    )
    const doc = await read()
    expect(doc?.plan).toBe("free")
    expect((doc?.planStartedAt as Timestamp).toDate()).toEqual(later(30))
  })

  it("keeps the plan of an older subscription when the newer one is cancelled", async () => {
    const pro = sub({ id: "sub_pro", items: [{ price: { id: "pri_pro_m" } }] })
    const unl = sub({ id: "sub_unl", items: [{ price: { id: "pri_unl_m" } }] })
    await applyPaddleEvent(db, event("evt_1", "subscription.created", T0, pro))
    await applyPaddleEvent(db, event("evt_2", "subscription.created", later(1), unl))
    expect((await read())?.plan).toBe("unlimited")
    // The older Pro renewing must not pull the user down from Unlimited.
    await applyPaddleEvent(db, event("evt_3", "subscription.updated", later(2), pro))
    expect((await read())?.plan).toBe("unlimited")
    await applyPaddleEvent(
      db,
      event(
        "evt_4",
        "subscription.canceled",
        later(3),
        { ...unl, status: "canceled", current_billing_period: null },
      ),
    )
    const doc = await read()
    expect(doc?.plan).toBe("pro")
    expect(doc?.status).toBe("active")
    expect(doc?.subscriptionId).toBe("sub_pro")
    // And once Pro goes too, the user is on Free.
    await applyPaddleEvent(
      db,
      event(
        "evt_5",
        "subscription.canceled",
        later(4),
        { ...pro, status: "canceled", current_billing_period: null },
      ),
    )
    expect((await read())?.plan).toBe("free")
  })

  it("drops an event older than its own subscription's last one", async () => {
    await applyPaddleEvent(db, event("evt_1", "subscription.created", later(5), sub()))
    expect(
      await applyPaddleEvent(
        db,
        event("evt_2", "subscription.canceled", later(4), sub({ status: "canceled" })),
      ),
    ).toBe("skipped: older than the last applied event")
    expect((await read())?.plan).toBe("pro")
  })

  it("ignores other event types and subscriptions without a uid", async () => {
    expect(await applyPaddleEvent(db, event("evt_3", "transaction.completed", T0, sub()))).toBe(
      "ignored-type",
    )
    expect(
      await applyPaddleEvent(
        db,
        event("evt_4", "subscription.created", T0, sub({ custom_data: null })),
      ),
    ).toBe("no-uid")
    expect(await read()).toBeUndefined()
  })
})

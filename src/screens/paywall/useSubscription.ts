import { onAuthStateChanged } from "firebase/auth"
import * as React from "react"

import {
  cycleDocId,
  listenToCycleUsage,
  type CycleUsage,
} from "@/data/ai-quota"
import {
  effectivePlan,
  listenToEntitlement,
  type Entitlement,
} from "@/data/entitlement"
import { shownFills, usePendingFills } from "@/data/ai-pending"
import { readPlanMirror, writePlanMirror } from "@/data/plan-mirror"
import { aiCycle, cycleWindow, type AiCycle } from "@/data/plans"
import { auth, db } from "@/lib/firebase"

// The live plan and AI cycle for the signed-in identity (ADR 0012/0013): one
// listener on the entitlement doc, one on the current cycle's counter, and a
// timer that rolls the cycle over at its end. The anchor is the entitlement's
// planStartedAt, or — for someone who has never bought — when the account was
// created; neither can be moved from the client.
//
// A returning launch seeds all three from the plan mirror (src/data/plan
// -mirror.ts), so the fill counter and a used-up allowance are on screen from
// the first frame instead of arriving once Firebase Auth has settled. The live
// listeners take over the moment they answer.

export interface SubscriptionState {
  /** The webhook-written doc, or null for someone who never subscribed. */
  entitlement: Entitlement | null
  /** Where the plan the app acts on stands in its cycle. */
  cycle: AiCycle
  /** The current cycle's counter doc id (aiCycles/{id}). */
  cycleId: string
  usage: CycleUsage
}

/** Null until the account, the entitlement and the cycle have all loaded. */
export function useSubscriptionState(
  uid: string | null
): SubscriptionState | null {
  // Read once, for the launch's identity; the uid checks below keep it from
  // ever standing in for another profile.
  const [seed] = React.useState(() => readPlanMirror(uid))
  const created = useAccountCreated(uid, seed?.createdMs ?? null)
  const [entitlement, setEntitlement] = React.useState<{
    uid: string
    value: Entitlement | null
  } | null>(() => (seed ? { uid: seed.uid, value: seed.entitlement } : null))
  React.useEffect(() => {
    if (uid === null) return
    return listenToEntitlement(db, uid, (value) =>
      setEntitlement({ uid, value })
    )
  }, [uid])

  const loaded = entitlement !== null && entitlement.uid === uid
  const ent = loaded ? entitlement.value : null
  const [now, setNow] = React.useState(() => new Date())
  const anchorMs = (ent?.planStartedAt ?? created)?.getTime() ?? null
  const span = React.useMemo(
    () => (anchorMs === null ? null : cycleWindow(new Date(anchorMs), now)),
    [anchorMs, now]
  )
  const cycleId = span ? cycleDocId(span.start) : null
  const endMs = span?.end.getTime() ?? null

  // Roll over at the cycle's end (a long-open app or an installed PWA left
  // running), and catch up when the page comes back into view.
  React.useEffect(() => {
    if (endMs === null) return
    const wait = Math.min(Math.max(0, endMs - Date.now()) + 1_000, 2 ** 31 - 1)
    const timer = setTimeout(() => setNow(new Date()), wait)
    const wake = () => {
      if (document.visibilityState === "visible" && Date.now() >= endMs) {
        setNow(new Date())
      }
    }
    document.addEventListener("visibilitychange", wake)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", wake)
    }
  }, [endMs])

  const [usage, setUsage] = React.useState<{
    key: string
    value: CycleUsage
  } | null>(() =>
    seed ? { key: `${seed.uid}/${seed.cycleId}`, value: seed.usage } : null
  )
  const usageKey = uid && cycleId ? `${uid}/${cycleId}` : null
  React.useEffect(() => {
    if (uid === null || cycleId === null) return
    const key = `${uid}/${cycleId}`
    return listenToCycleUsage(db, uid, cycleId, (value) =>
      setUsage({ key, value })
    )
  }, [uid, cycleId])

  // A tapped fill shows at once; the server's count catches up a moment later.
  const pending = usePendingFills()
  const state = React.useMemo(() => {
    if (!loaded || !span || !cycleId || usage?.key !== usageKey) return null
    const used = shownFills(pending, cycleId, usage.value.fills)
    return {
      entitlement: ent,
      cycle: aiCycle(effectivePlan(ent, now), used, span.end),
      cycleId,
      usage: usage.value,
    }
  }, [loaded, ent, now, span, cycleId, usage, usageKey, pending])

  const createdMs = created?.getTime() ?? null
  React.useEffect(() => {
    if (uid === null || state === null) return
    writePlanMirror({
      uid,
      createdMs,
      entitlement: state.entitlement,
      cycleId: state.cycleId,
      usage: state.usage,
    })
  }, [uid, createdMs, state])

  return state
}

/**
 * When the signed-in account was created — Free's cycle anchor. `seedMs` is
 * the mirrored value, used until Auth reports the account itself.
 */
function useAccountCreated(
  uid: string | null,
  seedMs: number | null
): Date | null {
  const [created, setCreated] = React.useState<{
    uid: string
    at: Date
  } | null>(() =>
    uid !== null && seedMs !== null ? { uid, at: new Date(seedMs) } : null
  )
  React.useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        const at = user?.metadata.creationTime
        setCreated(user && at ? { uid: user.uid, at: new Date(at) } : null)
      }),
    []
  )
  return created && created.uid === uid ? created.at : null
}

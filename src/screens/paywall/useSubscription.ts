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
import { aiCycle, cycleWindow, type AiCycle } from "@/data/plans"
import { auth, db } from "@/lib/firebase"

// The live plan and AI cycle for the signed-in identity (ADR 0012/0013): one
// listener on the entitlement doc, one on the current cycle's counter, and a
// timer that rolls the cycle over at its end. The anchor is the entitlement's
// planStartedAt, or — for someone who has never bought — when the account was
// created; neither can be moved from the client.

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
  const created = useAccountCreated(uid)
  const [entitlement, setEntitlement] = React.useState<{
    uid: string
    value: Entitlement | null
  } | null>(null)
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
  } | null>(null)
  const usageKey = uid && cycleId ? `${uid}/${cycleId}` : null
  React.useEffect(() => {
    if (uid === null || cycleId === null) return
    const key = `${uid}/${cycleId}`
    return listenToCycleUsage(db, uid, cycleId, (value) =>
      setUsage({ key, value })
    )
  }, [uid, cycleId])

  return React.useMemo(() => {
    if (!loaded || !span || !cycleId || usage?.key !== usageKey) return null
    return {
      entitlement: ent,
      cycle: aiCycle(effectivePlan(ent, now), usage.value.fills, span.end),
      cycleId,
      usage: usage.value,
    }
  }, [loaded, ent, now, span, cycleId, usage, usageKey])
}

/** When the signed-in account was created — Free's cycle anchor. */
function useAccountCreated(uid: string | null): Date | null {
  const [created, setCreated] = React.useState<{
    uid: string
    at: Date
  } | null>(null)
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

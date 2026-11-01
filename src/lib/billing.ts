import type { Paddle, PaddleEventData } from "@paddle/paddle-js"

import type { Billing } from "@/data/plans"
import { app } from "@/lib/firebase"
import {
  PADDLE,
  paddleConfigured,
  type PaidPlan,
} from "../../functions/src/paddle-config"

// The app's side of payments (ADR 0012): Paddle's overlay checkout for a first
// purchase, and two calls to our functions for what needs the API key — a
// customer-portal link and a plan change for someone already paying. All of it
// loads on first use, so the launch bundle carries none of it.
//
// The checkout carries the Firebase uid as custom data; the webhook writes the
// plan onto that uid, never matching by email (Google and payment emails often
// differ). The app waits for the plan on the entitlement listener — nothing
// here touches Firestore.

export { paddleConfigured }

let paddle: Promise<Paddle> | null = null
let onCheckoutEvent: ((event: PaddleEventData) => void) | null = null

/** Load and initialise Paddle.js once; later calls share the same instance. */
export function loadPaddle(): Promise<Paddle> {
  if (!paddleConfigured()) {
    return Promise.reject(new Error("Paddle is not configured"))
  }
  paddle ??= import("@paddle/paddle-js")
    .then(({ initializePaddle }) =>
      initializePaddle({
        environment: PADDLE.environment,
        token: PADDLE.clientToken,
        eventCallback: (event) => onCheckoutEvent?.(event),
      })
    )
    .then((instance) => {
      if (!instance) throw new Error("Paddle.js failed to load")
      return instance
    })
    .catch((err) => {
      paddle = null // let the next tap try again
      throw err
    })
  return paddle
}

export interface CheckoutRequest {
  plan: PaidPlan
  billing: Billing
  uid: string
  email: string | null
  language: string
  dark: boolean
  /** Paddle's overlay has drawn and can take taps. */
  onLoaded?: () => void
  /** The overlay could not open (a bad price, Paddle down). */
  onError?: () => void
  /** Paddle took the payment; the plan arrives on the listener shortly. */
  onCompleted?: () => void
}

/** Open Paddle's overlay checkout. Call after loadPaddle() has resolved. */
export async function openCheckout(req: CheckoutRequest): Promise<void> {
  const instance = await loadPaddle()
  onCheckoutEvent = (event) => {
    if (event.name === "checkout.loaded") req.onLoaded?.()
    else if (event.name === "checkout.error") req.onError?.()
    else if (event.name === "checkout.completed") req.onCompleted?.()
  }
  instance.Checkout.open({
    items: [{ priceId: PADDLE.prices[req.plan][req.billing], quantity: 1 }],
    customData: { uid: req.uid },
    ...(req.email ? { customer: { email: req.email } } : {}),
    settings: {
      displayMode: "overlay",
      variant: "one-page",
      theme: req.dark ? "dark" : "light",
      locale: req.language,
      allowLogout: false,
    },
  })
}

async function callable<Req, Res>(name: string, data: Req): Promise<Res> {
  const { getFunctions, httpsCallable, connectFunctionsEmulator } =
    await import("firebase/functions")
  const functions = getFunctions(app, "us-central1")
  // Local dev runs against the emulators (spec § Deploy & environments); the
  // functions emulator is started separately — docs/runbooks/paddle.md.
  if (import.meta.env.DEV && !emulatorConnected) {
    connectFunctionsEmulator(functions, "127.0.0.1", 5001)
    emulatorConnected = true
  }
  const result = await httpsCallable<Req, Res>(functions, name)(data)
  return result.data
}
let emulatorConnected = false

/** A short-lived link into Paddle's customer portal for this user. */
export async function portalLink(): Promise<string> {
  const { url } = await callable<Record<string, never>, { url: string }>(
    "paddlePortal",
    {}
  )
  return url
}

/** Move a running subscription to another plan; Paddle prorates the difference. */
export async function changePlan(
  plan: PaidPlan,
  billing: Billing
): Promise<void> {
  await callable("paddleChangePlan", { plan, billing })
}

/**
 * Open a URL we only learn after an await. A window opened after the await
 * loses the tap and gets blocked, so open a blank one first and point it once
 * the link arrives; where that fails, navigate this tab instead.
 */
export async function openExternal(link: () => Promise<string>): Promise<void> {
  const tab = window.open("", "_blank")
  if (tab) tab.opener = null
  try {
    const url = await link()
    if (tab) tab.location.href = url
    else window.location.assign(url)
  } catch (err) {
    tab?.close()
    throw err
  }
}

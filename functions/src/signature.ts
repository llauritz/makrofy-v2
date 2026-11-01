import { createHmac, timingSafeEqual } from "node:crypto"

// Paddle signs every webhook with the notification destination's secret:
// header `Paddle-Signature: ts=<unix seconds>;h1=<hex>`, where h1 is
// HMAC-SHA256 over `${ts}:${rawBody}`. During a secret rotation the header can
// carry more than one h1, so any match passes. The body must be the raw bytes
// as received — re-serialised JSON never matches.

/**
 * How old a signed timestamp may be. Paddle's SDKs use 5 s; a little more
 * absorbs a cold start without opening a meaningful replay window (each event
 * is applied once anyway — see webhook.ts).
 */
export const MAX_SIGNATURE_AGE_S = 60

export function verifyPaddleSignature(
  header: string | undefined,
  rawBody: Buffer | string,
  secret: string,
  nowMs: number = Date.now()
): boolean {
  if (!header || !secret) return false
  let ts: string | null = null
  const sigs: string[] = []
  for (const part of header.split(";")) {
    const eq = part.indexOf("=")
    if (eq < 0) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === "ts") ts = value
    else if (key === "h1") sigs.push(value)
  }
  if (ts === null || !/^\d+$/.test(ts) || sigs.length === 0) return false
  if (Math.abs(nowMs / 1000 - Number(ts)) > MAX_SIGNATURE_AGE_S) return false

  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")
  const expected = createHmac("sha256", secret).update(`${ts}:${body}`).digest()
  return sigs.some((sig) => {
    if (!/^[0-9a-f]+$/i.test(sig)) return false
    const given = Buffer.from(sig, "hex")
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

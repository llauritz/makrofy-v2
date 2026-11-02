import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"

import { describe, expect, it } from "vitest"

import { BOOT_MIRROR_KEY } from "@/data/boot-mirror"

// The goyaffle.web.app → yaffleapp.com move (ADR 0015) is an inline script in
// index.html, so it runs before anything paints. This runs that script
// against a fake page and checks who gets sent and who stays.

const html = readFileSync(join(__dirname, "..", "index.html"), "utf8")
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1])
  .find((s) => s.includes("yaffleapp.com"))

function visit(
  url: string,
  { keys = [] as string[], standalone = false } = {}
): string | null {
  const u = new URL(url)
  let sentTo: string | null = null
  runInNewContext(script!, {
    location: {
      hostname: u.hostname,
      pathname: u.pathname,
      search: u.search,
      hash: u.hash,
      replace: (to: string) => {
        sentTo = to
      },
    },
    matchMedia: (q: string) => ({
      matches: standalone && q.includes("standalone"),
    }),
    localStorage: { length: keys.length, key: (i: number) => keys[i] ?? null },
  })
  return sentTo
}

describe("index.html domain move", () => {
  it("sends a new visitor on goyaffle.web.app to the same page on yaffleapp.com", () => {
    expect(visit("https://goyaffle.web.app/?paywall#x")).toBe(
      "https://yaffleapp.com/?paywall#x"
    )
  })

  it("keeps anyone who already uses Yaffle there", () => {
    for (const key of [
      BOOT_MIRROR_KEY,
      "yaffle:plan-mirror:v1",
      "yaffle.paywall",
    ]) {
      expect(
        visit("https://goyaffle.web.app/", { keys: ["theme", key] })
      ).toBeNull()
    }
  })

  it("keeps the installed app", () => {
    expect(visit("https://goyaffle.web.app/", { standalone: true })).toBeNull()
  })

  it("leaves every other host alone", () => {
    for (const url of [
      "https://yaffleapp.com/",
      "https://goyaffle--pr127-abc.web.app/",
      "http://localhost:5173/",
    ]) {
      expect(visit(url)).toBeNull()
    }
  })

  it("does not count unrelated keys as a Yaffle user", () => {
    expect(
      visit("https://goyaffle.web.app/", { keys: ["theme", "language"] })
    ).toBe("https://yaffleapp.com/")
  })
})

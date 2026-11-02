import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"

import { describe, expect, it } from "vitest"

// The move to yaffleapp.com (ADR 0015) is an inline script in index.html and
// in each public page, so it runs before anything paints. This runs each copy
// against a fake page and checks where it sends the visit.

const pages = [
  "index.html",
  ...["terms", "privacy", "refunds", "pricing"].map((p) => `public/${p}.html`),
]

function moveScript(file: string): string {
  const html = readFileSync(join(__dirname, "..", file), "utf8")
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .find((s) => s.includes("yaffleapp.com"))
  if (!script) throw new Error(`${file} has no domain move script`)
  return script
}

function visit(script: string, url: string): string | null {
  const u = new URL(url)
  let sentTo: string | null = null
  runInNewContext(script, {
    location: {
      hostname: u.hostname,
      pathname: u.pathname,
      search: u.search,
      hash: u.hash,
      replace: (to: string) => {
        sentTo = to
      },
    },
  })
  return sentTo
}

describe.each(pages)("%s domain move", (file) => {
  const script = moveScript(file)

  it("sends the Firebase domains to the same page on yaffleapp.com", () => {
    expect(visit(script, "https://goyaffle.web.app/terms?paywall#x")).toBe(
      "https://yaffleapp.com/terms?paywall#x"
    )
    expect(visit(script, "https://goyaffle.firebaseapp.com/")).toBe(
      "https://yaffleapp.com/"
    )
  })

  it("leaves every other host alone", () => {
    for (const url of [
      "https://yaffleapp.com/",
      "https://goyaffle--pr127-abc.web.app/",
      "http://localhost:5173/",
    ]) {
      expect(visit(script, url)).toBeNull()
    }
  })
})

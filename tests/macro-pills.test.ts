import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

// Every P/F/C pill comes from src/screens/main/MacroPills.tsx (MacroChips,
// MacroInputPill). After the pill redesign (#93) two screens kept a
// hand-built copy with the old dot + grey letter; this keeps that from
// happening again by failing on any pill built outside the shared file.

const SRC = join(import.meta.dirname, "..", "src")
const SHARED = "screens/main/MacroPills.tsx"

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

const files = sources(SRC).map((path) => ({
  file: relative(SRC, path).replaceAll("\\", "/"),
  code: readFileSync(path, "utf8"),
}))

describe("macro pills", () => {
  it("are only tinted inside the shared pill file", () => {
    // A color-mix wash of a macro color is what makes a pill a macro pill.
    const offenders = files
      .filter(({ file }) => file !== SHARED)
      .filter(({ code }) => /color-mix\([^)]*(\.mark|--macro-)/.test(code))
      .map(({ file }) => file)
    expect(offenders).toEqual([])
  })

  it("never render the macro letter as plain text", () => {
    // The letter is always MacroLetter (colored Nunito Black), never
    // `{m.letter}` beside a dot.
    const offenders = files
      .filter(({ file }) => file !== "screens/main/MacroLetter.tsx")
      .filter(({ code }) => /(^|>)\s*\{\s*\w+\.letter\s*\}/m.test(code))
      .map(({ file }) => file)
    expect(offenders).toEqual([])
  })

  it("place MacroLetter only in the shared pills and the summary capsule", () => {
    const allowed = [SHARED, "screens/main/SummaryCard.tsx"]
    const offenders = files
      .filter(({ file }) => !allowed.includes(file))
      .filter(({ code }) => /<MacroLetter\b/.test(code))
      .map(({ file }) => file)
    expect(offenders).toEqual([])
  })
})

// The i18n hardcoded-string sweep (issue #25 acceptance: "No hardcoded
// user-facing strings outside the dictionaries, lintable via a grep sweep").
//
// It scans the rendered UI — the screens, shared components and PWA entries —
// for the two shapes a user-facing English literal takes: JSX text between
// tags, and a string literal in a user-facing attribute (aria-label, title,
// placeholder). Everything user-facing goes through the typed dictionaries
// (src/lib/i18n) as `{t.…}` / `{n(…)}`, so a literal here is a miss.
//
// It is a grep, not a compiler: it deliberately trades a few blind spots (a
// literal assigned to a variable, then rendered) for zero false positives on
// className/style/config strings. The dictionaries themselves are the one place
// literals belong, so they are out of scope. Run: `pnpm i18n:sweep`.

import { readdirSync, readFileSync, statSync } from "node:fs"
import { relative, resolve } from "node:path"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// The rendered surface. Pure logic (src/lib), the data layer and the
// dictionaries are out of scope — none renders literal UI text.
const ROOTS = ["src/screens", "src/components", "src/pwa"]
const EXTRA_FILES = ["src/App.tsx"]

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(t|j)sx?$/.test(name)) out.push(full)
  }
  return out
}

// Blank out comments and quoted strings so their prose can't look like JSX
// text, preserving length and newlines so match offsets still map to the right
// source line. Attributes are checked against the original source (their value
// *is* a quoted string).
const blank = (m) => m.replace(/[^\n]/g, " ")
function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank) // block comments
    .replace(/\/\/[^\n]*/g, blank) // line comments
    .replace(/"(?:[^"\\]|\\.)*"/g, blank) // double-quoted
    .replace(/'(?:[^'\\]|\\.)*'/g, blank) // single-quoted
    .replace(/`(?:[^`\\]|\\.)*`/g, blank) // template literals
}

// A hardcoded word sitting between an opening tag and its closing tag —
// `<tag>Literal</tag>` — rather than `{t.foo}`. Anchoring on the closing `</`
// is what keeps a TypeScript generic (`Promise<void>`) or arrow (`=> (`) from
// ever matching: neither is followed by a closing tag. The run holds no `{…}`
// and never crosses a newline. (A literal that precedes an *opening* tag or an
// expression — `Hi {name}` — is a documented blind spot; the compiler and the
// dictionary parity test cover the rest.)
const JSX_TEXT = />\s*([A-Za-z][^<>{}\n]*?)\s*<\//g
// aria-label / title / placeholder with a non-empty quoted literal.
const ATTR = /\b(aria-label|title|placeholder)\s*=\s*"([^"]*[A-Za-z][^"]*)"/g

function findings(file, src) {
  const found = []
  const lineOf = (index) => src.slice(0, index).split("\n").length

  const stripped = stripCommentsAndStrings(src)
  for (const m of stripped.matchAll(JSX_TEXT)) {
    const text = m[1].trim()
    if (text) found.push({ line: lineOf(m.index), kind: "jsx text", text })
  }
  for (const m of src.matchAll(ATTR)) {
    found.push({ line: lineOf(m.index), kind: `${m[1]}`, text: m[2] })
  }
  return found.sort((a, b) => a.line - b.line)
}

const files = [
  ...ROOTS.flatMap((r) => walk(resolve(root, r))),
  ...EXTRA_FILES.map((f) => resolve(root, f)),
]

let total = 0
for (const file of files) {
  const hits = findings(file, readFileSync(file, "utf8"))
  if (hits.length === 0) continue
  total += hits.length
  const rel = relative(root, file).replace(/\\/g, "/")
  for (const h of hits) {
    console.log(`${rel}:${h.line}  [${h.kind}]  ${h.text}`)
  }
}

if (total > 0) {
  console.error(
    `\n${total} hardcoded user-facing string(s) found — move them into src/lib/i18n (#25).`,
  )
  process.exit(1)
}
console.log(`i18n sweep clean: no hardcoded user-facing strings in ${files.length} files.`)

// Runs a command inside `firebase emulators:exec` (Auth + Firestore).
// firebase-tools launches plain `java` from PATH and the Firestore emulator
// needs JDK 21+, so prepend JAVA_HOME/bin — that lets a modern JDK win over
// an older system-wide Java without touching machine PATH.
//
// Usage: node scripts/emulators.mjs [--ui] <command...>
import { spawn } from "node:child_process"
import { delimiter, join } from "node:path"

const args = process.argv.slice(2)
const ui = args[0] === "--ui" ? args.shift() : null
const script = args.join(" ")
if (!script) {
  console.error("Usage: node scripts/emulators.mjs [--ui] <command...>")
  process.exit(2)
}

const env = { ...process.env }
// emulators:exec runs the script in a bare shell, so local binaries (vite,
// vitest) need node_modules/.bin on PATH explicitly.
env.PATH = join(import.meta.dirname, "..", "node_modules", ".bin") + delimiter + (env.PATH ?? "")
if (env.JAVA_HOME) {
  env.PATH = join(env.JAVA_HOME, "bin") + delimiter + env.PATH
}

const cmd = `firebase emulators:exec --only auth,firestore ${ui ? "--ui " : ""}"${script}"`
const child = spawn(cmd, { stdio: "inherit", env, shell: true })
child.on("exit", (code) => process.exit(code ?? 1))

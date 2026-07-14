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
// vitest) need node_modules/.bin on PATH explicitly, and JAVA_HOME/bin goes
// first so a modern JDK wins over an older system-wide java (see top comment).
// Windows keys the search path `Path`, not `PATH`; spreading process.env yields
// a plain, case-sensitive object, so writing a fresh `env.PATH` would leave the
// real `Path` untouched and let the two collide — dropping the inherited search
// path, and with it a globally-installed `firebase`. Find the real key and
// prepend to it.
const pathKey = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH"
const prefix = [
  env.JAVA_HOME ? join(env.JAVA_HOME, "bin") : undefined,
  join(import.meta.dirname, "..", "node_modules", ".bin"),
]
  .filter(Boolean)
  .join(delimiter)
env[pathKey] = prefix + delimiter + (env[pathKey] ?? "")

const cmd = `firebase emulators:exec --only auth,firestore ${ui ? "--ui " : ""}"${script}"`
const child = spawn(cmd, { stdio: "inherit", env, shell: true })
child.on("exit", (code) => process.exit(code ?? 1))

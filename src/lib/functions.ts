import { app } from "@/lib/firebase"

// Calls into our Cloud Functions (functions/src/index.ts). The SDK loads on
// first use, so the launch bundle carries none of it.

let emulatorConnected = false

export async function callable<Req, Res>(
  name: string,
  data: Req
): Promise<Res> {
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

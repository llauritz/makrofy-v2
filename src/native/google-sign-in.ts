// Native Google sign-in for the Android app. Firebase's redirect and popup
// flows can't run inside a WebView, so Android's Credential Manager shows the
// system account picker and hands back a Google ID token; src/data/identity.ts
// turns that into a Firebase credential and links it onto the Guest exactly as
// the web redirect does (ADR 0002).

// The Firebase project's Web OAuth client (auto-created for Google sign-in).
// Credential Manager mints the ID token for this audience, which is what the
// Firebase JS SDK accepts. Public by design, like the Firebase config.
const GOOGLE_WEB_CLIENT_ID =
  "133375256638-46vojl8a40fd36omhfoufplaqiinftjr.apps.googleusercontent.com"

/** Thrown when the user backs out of the account picker. */
export class GoogleSignInCancelled extends Error {
  constructor() {
    super("Google sign-in was cancelled")
    this.name = "GoogleSignInCancelled"
  }
}

let initialized: Promise<void> | null = null

async function plugin() {
  const { SocialLogin } = await import("@capgo/capacitor-social-login")
  initialized ??= SocialLogin.initialize({
    google: { webClientId: GOOGLE_WEB_CLIENT_ID },
  })
  await initialized
  return SocialLogin
}

// Credential Manager reports a dismissed picker as a cancellation; the plugin
// passes its message through.
function isCancellation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /cancel/i.test(message)
}

/**
 * Show the Android account picker and resolve with the chosen account's Google
 * ID token. Rejects with GoogleSignInCancelled when the user dismisses it.
 */
export async function pickGoogleAccount(): Promise<string> {
  const SocialLogin = await plugin()
  let response
  try {
    response = await SocialLogin.login({
      provider: "google",
      options: {},
    })
  } catch (err) {
    if (isCancellation(err)) throw new GoogleSignInCancelled()
    throw err
  }
  const result = response.result
  const idToken =
    "idToken" in result && typeof result.idToken === "string"
      ? result.idToken
      : null
  if (!idToken) throw new Error("Google sign-in returned no ID token")
  return idToken
}

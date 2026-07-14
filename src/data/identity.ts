import {
  getRedirectResult,
  GoogleAuthProvider,
  linkWithRedirect,
  signInAnonymously,
  signInWithCredential,
  signOut,
  type Auth,
  type AuthCredential,
  type AuthError,
  type User,
} from "firebase/auth"
import type { Firestore } from "firebase/firestore"

import { readAllEntries, writeEntries } from "@/data/entries"

const RETRY_BASE_MS = 2_000
const RETRY_MAX_MS = 60_000

// A link/sign-in failure with one of these codes means the Google account
// already exists — the second-device case that triggers a union merge.
const CREDENTIAL_IN_USE = new Set([
  "auth/credential-already-in-use",
  "auth/email-already-in-use",
])

// Transient failures worth retrying silently; anything else (e.g. provider
// misconfiguration) should surface, not loop forever.
const RETRYABLE = new Set(["auth/network-request-failed", "auth/too-many-requests"])

/**
 * Resolve with the app's Firebase identity, minting a silent Guest
 * (anonymous) identity when none exists — ADR 0002. Whenever the app opens
 * without an identity this retries quietly until connectivity allows the
 * sign-in; there is no designed first-run-offline UX (spec § Identity).
 */
export async function ensureIdentity(auth: Auth): Promise<User> {
  await auth.authStateReady()
  if (auth.currentUser) return auth.currentUser
  for (let attempt = 0; ; attempt++) {
    try {
      const { user } = await signInAnonymously(auth)
      return user
    } catch (err) {
      if (!isRetryable(err)) throw err
      await nextChance(Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS))
    }
  }
}

// True when err is a Firebase-style error whose `code` is one of `codes`.
function hasAuthErrorCode(err: unknown, codes: Set<string>): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    codes.has(String((err as { code: unknown }).code))
  )
}

function isRetryable(err: unknown): boolean {
  return hasAuthErrorCode(err, RETRYABLE)
}

// Resolves after the backoff delay, or as soon as the browser reports
// connectivity is back — whichever comes first.
function nextChance(delayMs: number): Promise<void> {
  const target = typeof window === "undefined" ? undefined : window
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      target?.removeEventListener("online", done)
      resolve()
    }
    const timer = setTimeout(done, delayMs)
    target?.addEventListener("online", done)
  })
}

/** The account signed in after a union merge, and how much was carried over. */
export interface MergeOutcome {
  /** The pre-existing account now signed in. */
  uid: string
  /** How many Guest Entries were copied in. */
  merged: number
}

/** What finishing a Google sign-in redirect did. */
export type SignInOutcome =
  | { kind: "none" } // no redirect was pending
  | { kind: "linked"; uid: string } // linked cleanly onto the Guest UID
  | ({ kind: "merged" } & MergeOutcome) // collision → union merge

/**
 * The app-load identity sequence. First finish any pending Google sign-in
 * redirect — it may switch us into a merged account — then guarantee an
 * identity always exists, minting a fresh Guest on a first-ever launch or after
 * a sign-out. A redirect that fails for any reason other than a resolvable
 * collision is logged, never thrown: a botched sign-in must not keep the app
 * from opening.
 */
export async function bootstrapIdentity(auth: Auth, db: Firestore): Promise<User> {
  try {
    const outcome = await completeGoogleRedirect(auth, db)
    // A union merge is silent to the user (ADR 0002) but worth a dev-log — it's
    // the one branch that moved data and switched accounts.
    if (outcome.kind === "merged") {
      console.info(`Signed in; merged ${outcome.merged} Guest entries in`)
    }
  } catch (err) {
    console.error("Google sign-in did not complete", err)
  }
  return ensureIdentity(auth)
}

/**
 * Begin Google sign-in by *linking* the credential onto the current Guest, so
 * the UID is unchanged and the Guest's data stays put (ADR 0002). Redirect, not
 * popup: the authDomain/handler setup (#12, spec § Deploy) keeps the redirect
 * iframe same-origin under third-party-storage blocking, where popups fail. The
 * call navigates away and never resolves; the outcome lands in
 * completeGoogleRedirect on the next load.
 */
export async function startGoogleSignIn(auth: Auth): Promise<void> {
  const user = auth.currentUser
  if (!user) throw new Error("startGoogleSignIn: no identity to link onto")
  await linkWithRedirect(user, new GoogleAuthProvider())
}

/**
 * Finish a Google sign-in redirect on app load (spec § Identity). A clean link
 * is already done by the SDK — the Guest UID simply gained a Google credential,
 * nothing to do. A collision (the account already has data — the second-device
 * case) surfaces here as an error we resolve by union-merging, with no prompt.
 * Returns "none" when no redirect was pending.
 */
export async function completeGoogleRedirect(
  auth: Auth,
  db: Firestore,
): Promise<SignInOutcome> {
  let result
  try {
    result = await getRedirectResult(auth)
  } catch (err) {
    if (!isCredentialInUseError(err)) throw err
    // Second-device collision. The redirect error carries the Google credential
    // (the real OAuth tokens Google returned), and the current user is still the
    // Guest, so we lift both and union-merge with no prompt (ADR 0002).
    const credential = GoogleAuthProvider.credentialFromError(err as AuthError)
    const guestUid = auth.currentUser?.uid
    if (!credential || !guestUid) throw err
    return {
      kind: "merged",
      ...(await unionMergeInto(auth, db, credential, guestUid)),
    }
  }
  if (!result) return { kind: "none" }
  return { kind: "linked", uid: result.user.uid }
}

/** Whether a link/sign-in error means the Google account already exists. */
export function isCredentialInUseError(err: unknown): boolean {
  return hasAuthErrorCode(err, CREDENTIAL_IN_USE)
}

/**
 * Copy a Guest's Entries into a pre-existing account and switch to it — the
 * union merge (ADR 0002). Copy-first and promptless: read the Guest's Entries
 * while still signed in as the Guest, sign into the existing account with its
 * Google credential, then batch-write the Entries in. Auto-ids make it a clean
 * union; the existing account's settings are left untouched (they win), and the
 * Guest's now-orphaned documents are left behind rather than risking a
 * delete-before-write. Returns the account now signed in and the copied count.
 */
export async function unionMergeInto(
  auth: Auth,
  db: Firestore,
  credential: AuthCredential,
  guestUid: string,
): Promise<MergeOutcome> {
  const entries = await readAllEntries(db, guestUid)
  const { user } = await signInWithCredential(auth, credential)
  await writeEntries(db, user.uid, entries)
  return { uid: user.uid, merged: entries.length }
}

/** Sign out and return a fresh Guest — a brand-new anonymous identity (#19). */
export async function signOutToGuest(auth: Auth): Promise<User> {
  await signOut(auth)
  return ensureIdentity(auth)
}

/**
 * Re-establish the identity for the sync indicator's attention state (#19).
 * After a long offline stretch a write can pause on an expired token; forcing a
 * refresh lets a resumed-online session flush its queued writes. Falls back to
 * minting a Guest if the session is somehow gone.
 */
export async function refreshIdentity(auth: Auth): Promise<void> {
  const user = auth.currentUser
  if (user) {
    await user.getIdToken(true)
  } else {
    await ensureIdentity(auth)
  }
}

import { LogIn, UserRound } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Squircle } from "@/components/ui/squircle"
import { useAuthUser } from "@/data/hooks"
import { signOutToGuest, startGoogleSignIn } from "@/data/identity"
import { auth, db } from "@/lib/firebase"
import { GoogleSignInCancelled } from "@/native/google-sign-in"
import { useI18n } from "@/lib/i18n/useI18n"

// The Settings sign-in surface (#19). Signed out (a Guest), it offers Google
// sign-in — which *links* onto the same identity, so nothing already logged is
// disturbed (ADR 0002); a second-device collision union-merges silently on the
// way back in. Signed in, it shows the account and a way back to a fresh Guest.
// On the web, sign-in redirects away and resolves on the next load
// (completeGoogleRedirect), so there's no in-page spinner to show. In the
// Android app it happens in place over the system account picker: the row is
// disabled meanwhile, and a failure (not a cancel) leaves one quiet line.
export function SignInSetting() {
  const { t } = useI18n()
  const user = useAuthUser()
  const signedIn = user !== null && !user.isAnonymous
  const [pending, setPending] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  const signIn = async () => {
    setPending(true)
    setFailed(false)
    try {
      const outcome = await startGoogleSignIn(auth, db)
      if (outcome.kind === "merged") {
        console.info(`Signed in; merged ${outcome.merged} Guest entries in`)
      }
    } catch (err) {
      if (!(err instanceof GoogleSignInCancelled)) {
        console.error("Google sign-in did not complete", err)
        setFailed(true)
      }
    } finally {
      setPending(false)
    }
  }

  if (signedIn) {
    return (
      <Squircle radius="2xl" className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
          <UserRound className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium">
            {user.displayName ?? t.signIn.signedInFallback}
          </div>
          {user.email && (
            <div className="truncate text-[13px] text-muted-foreground">
              {user.email}
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void signOutToGuest(auth)}
        >
          {t.signIn.signOut}
        </Button>
      </Squircle>
    )
  }

  return (
    <Squircle asChild radius="2xl">
      <button
        type="button"
        disabled={user === null || pending}
        onClick={() => void signIn()}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-45"
      >
        <LogIn className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">
            {t.signIn.signInWithGoogle}
          </span>
          <span className="block text-[13px] text-muted-foreground">
            {failed ? t.signIn.signInFailed : t.signIn.signInSubtitle}
          </span>
        </span>
      </button>
    </Squircle>
  )
}

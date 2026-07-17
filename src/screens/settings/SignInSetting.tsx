import { LogIn, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuthUser } from "@/data/hooks"
import { signOutToGuest, startGoogleSignIn } from "@/data/identity"
import { auth } from "@/lib/firebase"
import { useI18n } from "@/lib/i18n/useI18n"

// The Settings sign-in surface (#19). Signed out (a Guest), it offers Google
// sign-in — which *links* onto the same identity, so nothing already logged is
// disturbed (ADR 0002); a second-device collision union-merges silently on the
// way back in. Signed in, it shows the account and a way back to a fresh Guest.
// Sign-in redirects away and resolves on the next load (completeGoogleRedirect),
// so there's no in-page spinner to show.
export function SignInSetting() {
  const { t } = useI18n()
  const user = useAuthUser()
  const signedIn = user !== null && !user.isAnonymous

  if (signedIn) {
    return (
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3">
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
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={user === null}
      onClick={() => void startGoogleSignIn(auth)}
      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-45"
    >
      <LogIn className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">
          {t.signIn.signInWithGoogle}
        </span>
        <span className="block text-[13px] text-muted-foreground">
          {t.signIn.signInSubtitle}
        </span>
      </span>
    </button>
  )
}

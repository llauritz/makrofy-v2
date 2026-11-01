import { LogIn, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Squircle } from "@/components/ui/squircle"
import { forgetGoogleAccount } from "@/data/cloud-account"
import { useAuthUser } from "@/data/hooks"
import { signOutToGuest, startGoogleSignIn } from "@/data/identity"
import { auth } from "@/lib/firebase"
import { useI18n } from "@/lib/i18n/useI18n"
import { RowBlink } from "@/screens/settings/RowBlink"

// The Settings sign-in surface (#19). Signed out (a Guest), it offers Google
// sign-in — which *links* onto the same identity, so nothing already logged is
// disturbed (ADR 0002); a second-device collision union-merges silently on the
// way back in. Signed in, it shows the account and a way back to a fresh Guest.
// Sign-in redirects away and resolves on the next load (completeGoogleRedirect),
// so there's no in-page spinner to show. `highlight` blinks the row once, when
// the header's "Sync data" sent the user here to find it (RowBlink).
export function SignInSetting({ highlight = false }: { highlight?: boolean }) {
  const { t } = useI18n()
  const user = useAuthUser()
  const signedIn = user !== null && !user.isAnonymous

  if (signedIn) {
    return (
      <Squircle
        radius="2xl"
        className="relative isolate flex items-center gap-3 px-4 py-3"
      >
        <RowBlink active={highlight} />
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
          onClick={() => {
            forgetGoogleAccount()
            void signOutToGuest(auth)
          }}
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
        disabled={user === null}
        onClick={() => void startGoogleSignIn(auth)}
        className="relative isolate flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-45"
      >
        <RowBlink active={highlight} />
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
    </Squircle>
  )
}

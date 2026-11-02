---
status: accepted
---

# yaffleapp.com is the primary domain; goyaffle.web.app keeps serving

Yaffle moved from Firebase's default `goyaffle.web.app` to its own domain,
`yaffleapp.com` (registered at Cloudflare, served by Firebase Hosting). Firebase
keeps serving every site on its default domains as well, so the question was
what `goyaffle.web.app` should do.

## Decisions

- **New visitors on goyaffle.web.app go to yaffleapp.com.** A small script at
  the top of `index.html` replaces the page with the same path on
  yaffleapp.com before anything paints. One domain for links, search, Paddle's
  domain review and installs.
- **Existing users there stay.** A Guest account (ADR 0002) and the offline
  store (ADR 0001) belong to the origin they were made on and cannot follow to
  another domain, and an installed app is bound to its origin too. So the
  script does nothing when the page runs as an installed app or when
  localStorage holds any `yaffle:`/`yaffle.` key (the boot and plan mirrors and
  the other Yaffle settings, which every launched profile has).
- **Sign-in works on both.** `authDomain` is whichever of `yaffleapp.com`,
  `goyaffle.web.app` or `goyaffle.firebaseapp.com` serves the page, so the
  redirect helper stays same-origin (#10 Option 1). Each domain's
  `/__/auth/handler` is an authorized redirect URI in the Google OAuth client.
  Preview channels and local dev keep `goyaffle.web.app`, as before.
- **Public pages point to yaffleapp.com** with a canonical link, and stay
  readable on both domains (no redirect), so a link from an existing user's
  app on goyaffle.web.app keeps them on their own origin.

## Consequences

- The redirect must not ship before yaffleapp.com serves the app, or new
  visitors to goyaffle.web.app land on a dead domain. Setup order:
  `docs/runbooks/domain.md`.
- Every domain-bound console setting exists for both domains: Firebase Auth
  authorized domains, the OAuth client, the reCAPTCHA Enterprise key behind
  App Check, and Paddle's approved domains.
- Someone moving from goyaffle.web.app to yaffleapp.com signs in with Google
  first; a Guest's data does not move on its own.

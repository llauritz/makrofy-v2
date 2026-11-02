---
status: accepted
---

# yaffleapp.com is the primary domain; the Firebase domains forward to it

Yaffle moved from Firebase's default `goyaffle.web.app` to its own domain,
`yaffleapp.com` (registered at Cloudflare, served by Firebase Hosting). Firebase
keeps serving every site on its default domains as well, so the question was
what `goyaffle.web.app` (and `goyaffle.firebaseapp.com`) should do.

## Decisions

- **Every visit to a Firebase domain goes to yaffleapp.com** (owner's choice,
  2 November 2026). A small script at the top of `index.html` and of each
  public page replaces the page with the same path, query and hash on
  yaffleapp.com before anything paints. Old links keep working, and there is
  one domain for links, search, installs and Paddle's domain review.
- **Considered and not chosen:** forwarding only new visitors, so that
  existing users and installs stayed on goyaffle.web.app; and serving both
  domains with no forwarding. Both keep two origins alive, with two sets of
  installs and console settings, to protect users the app barely has before
  launch.
- **Sign-in:** `authDomain` is `yaffleapp.com` on yaffleapp.com, so the
  redirect helper stays same-origin (#10 Option 1). Preview channels and local
  dev keep `goyaffle.web.app`, as before.

## Consequences

- A Guest account (ADR 0002) and the offline store (ADR 0001) belong to the
  origin they were made on. A Guest on goyaffle.web.app who never signed in
  with Google loses access to their entries; a signed-in user signs in again
  on yaffleapp.com and has everything.
- An app installed from goyaffle.web.app opens yaffleapp.com inside a browser
  frame; reinstall it from yaffleapp.com.
- The forwarding must not ship before yaffleapp.com serves the app, or every
  visit lands on a dead domain. Setup order: `docs/runbooks/domain.md`.

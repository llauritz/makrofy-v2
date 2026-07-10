# Guest mode is Anonymous Auth; sign-in links; collisions union-merge

The app must be fully usable signed out. A Guest is a Firebase **Anonymous Auth** user created on first launch, so signed-out and signed-in users run the identical Firestore data path. Signing in with Google **links** the credential to the anonymous user — same UID, all Guest data already in place, nothing copied. When linking fails because the Google account already has Makrofy data (second-device case), we perform an **automatic union merge** with no prompt: hold the Guest's entries in memory, sign into the existing account, batch-write the Guest entries in (UUID/auto-ids make it a clean union), and keep the existing account's settings.

## Consequences

- Merge is copy-first: the orphaned anonymous account's documents are left behind rather than risking a delete-before-write data loss. They are unreachable garbage and negligible at this scale.
- Firebase Auth's optional **anonymous-account auto-cleanup must stay OFF** — it deletes anonymous users ~30 days after creation, which would strand long-term Guests. Guest mode is first-class; this is load-bearing.
- Discard-on-sign-in and ask-at-sign-in were rejected: silently losing logged days is the V1 failure class, and a decision screen violates "the app is easy".

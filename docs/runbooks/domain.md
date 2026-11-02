# Domain: yaffleapp.com

`yaffleapp.com` is the primary domain, served by Firebase Hosting;
`goyaffle.web.app` and `goyaffle.firebaseapp.com` forward every visit to it
(ADR 0015). The domain is registered at
Cloudflare, which also runs its DNS.

Do the steps in this order: the code that forwards goyaffle.web.app to
yaffleapp.com must not go live before yaffleapp.com works.

## 1. Firebase Hosting: connect the domain

Firebase console → project `goyaffle` → Hosting → **Add custom domain**.

1. Domain `yaffleapp.com`. Leave "Redirect to an existing website" off.
2. Firebase shows the DNS records to add: usually a **TXT** record (ownership)
   and an **A** record (where the site lives), sometimes an `_acme-challenge`
   record for the certificate. Keep the page open for step 2.
3. Afterwards, **Add custom domain** again for `www.yaffleapp.com` with
   "Redirect to an existing website" on, pointing at `yaffleapp.com`, and add
   the records it shows the same way.

## 2. Cloudflare: DNS records

Cloudflare dashboard → yaffleapp.com → DNS → Records.

- Delete any A, AAAA or CNAME record Cloudflare already made for
  `yaffleapp.com` (`@`) or `www`.
- Add each record exactly as Firebase shows it. For the apex, the name is `@`.
- **Proxy status: DNS only (grey cloud)** on every record. With the orange
  cloud, Firebase cannot verify the domain or issue its certificate.
- If there are CAA records, add `letsencrypt.org` and `pki.goog`, or remove
  them.

Back in Firebase, the domain goes from "Needs setup" to "Pending" to
"Connected". The certificate usually takes under an hour, at most 24 hours.
Done when `https://yaffleapp.com` opens Yaffle with a valid certificate.

## 3. Firebase Auth: authorized domain

Firebase console → Authentication → Settings → **Authorized domains** → Add
domain `yaffleapp.com`. Leave `goyaffle.web.app` and `goyaffle.firebaseapp.com`
in place.

## 4. Google OAuth client

Google Cloud console → project `goyaffle` → Google Auth Platform (APIs &
Services) → **Clients** → *Web client (auto created by Google Service)*:

- Authorized JavaScript origins: add `https://yaffleapp.com`.
- Authorized redirect URIs: add `https://yaffleapp.com/__/auth/handler`.
- Keep the goyaffle.web.app entries. Save.

Google Auth Platform → **Branding**:

- Authorized domains: add `yaffleapp.com`.
- App home page `https://yaffleapp.com`, privacy policy
  `https://yaffleapp.com/privacy`, terms `https://yaffleapp.com/terms`.

## 5. App Check (reCAPTCHA Enterprise)

AI fill sends an App Check token, which reCAPTCHA Enterprise only issues on the
key's listed domains. The key lives in the Google Cloud console, not the
Firebase console (App Check there only shows it), and needs no separate
account: <https://console.cloud.google.com/security/recaptcha?project=goyaffle>
→ the key `6LcoOE4t…` (the one in `src/lib/ai.ts`) → **Edit key** → Domains:
add `yaffleapp.com`, keep the others, Save. Without this, AI fill fails on the
new domain. Not the classic admin page at google.com/recaptcha/admin.

## 6. API key (only if restricted)

Google Cloud console → APIs & Services → Credentials → *Browser key (auto
created by Firebase)*. If "Application restrictions" is set to Websites, add
`https://yaffleapp.com/*`. If it is None, nothing to do.

## 7. Sign in on the old domain

Before merging, open Yaffle on goyaffle.web.app on every phone or browser that
has entries, and sign in with Google (Settings). A Guest's entries stay behind
on goyaffle.web.app once it forwards.

## 8. Merge and check

Merge the domain PR (hosting deploys on merge). Then, in a private window:

- `https://yaffleapp.com`: the welcome screen shows; Google sign-in says
  "to continue to yaffleapp.com" and comes back signed in; an AI fill works.
- `https://www.yaffleapp.com` lands on `https://yaffleapp.com`.
- `https://goyaffle.web.app` lands on `https://yaffleapp.com`.
- `https://goyaffle.web.app/terms` lands on `https://yaffleapp.com/terms`.
- Sign in with Google on yaffleapp.com: your entries are there.

## 9. Paddle

- Sandbox: Checkout → Checkout settings → default payment link
  `https://yaffleapp.com/`.
- Live: submit `yaffleapp.com` for website approval. See
  `docs/runbooks/paddle.md` → Go-live.

## Moving your own install

An app installed from goyaffle.web.app opens yaffleapp.com in a browser frame
after the move. Remove it, open `https://yaffleapp.com`, sign in with Google
and install from there.

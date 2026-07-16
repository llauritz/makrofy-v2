/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /**
   * App Check debug token for local dev (git-ignored .env.local, provisioned
   * in #12) — AI Logic is the one auto-enforced product (#20). Absent in
   * production builds, where reCAPTCHA Enterprise attests instead.
   */
  readonly VITE_APPCHECK_DEBUG_TOKEN?: string
}

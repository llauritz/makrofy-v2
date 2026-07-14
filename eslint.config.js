import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `.claude` holds tooling and session git worktrees (nested clones with their
  // own tsconfigs); never lint them, or typescript-eslint sees multiple roots.
  // `makrofy-v1` (the git-ignored V1 snapshot) and `.remember` (session notes)
  // are local-only dirs CI never checks out — ignoring them keeps a local
  // `pnpm lint` equal to the CI run.
  globalIgnores(['dist', '.claude', 'makrofy-v1', '.remember']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])

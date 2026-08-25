import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    // Node by default (the emulator suites); component behavior tests opt in
    // to jsdom per-file via an `@vitest-environment jsdom` docblock.
    environment: "node",
    // All files share one emulator project and wipe it between tests —
    // parallel files would clear each other's data mid-flight.
    fileParallelism: false,
    // Emulator round-trips; generous so listener tests never flake on cold starts.
    testTimeout: 15000,
    hookTimeout: 30000,
    server: {
      deps: {
        // @squircle-js/react@1.3.0 is mis-packaged: its package.json says
        // "type": "module" while `main` (dist/index.js) is CommonJS, so Node's
        // own ESM loader throws "module is not defined" on it. Inlining routes
        // the import through Vite, which picks the real ESM build instead.
        // Vite's own dev/build resolution already prefers that build, so this
        // is a test-only workaround.
        inline: ["@squircle-js/react"],
      },
    },
  },
})

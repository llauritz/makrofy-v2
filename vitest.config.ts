import path from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // All files share one emulator project and wipe it between tests —
    // parallel files would clear each other's data mid-flight.
    fileParallelism: false,
    // Emulator round-trips; generous so listener tests never flake on cold starts.
    testTimeout: 15000,
    hookTimeout: 30000,
  },
})

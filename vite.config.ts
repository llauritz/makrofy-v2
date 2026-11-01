import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Silent background update, no prompts; the new shell takes over on the
      // next open (spec § PWA & offline, #10).
      registerType: "autoUpdate",
      // We register the service worker ourselves in src/pwa/register.ts.
      injectRegister: null,
      manifest: {
        id: "/",
        name: "Yaffle",
        short_name: "Yaffle",
        description: "A calm calorie and macro tracker.",
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        // Android draws its splash from background_color. This light theme_color
        // is the OS-chrome default; ThemeProvider keeps a single theme-color meta
        // in index.html synced to the resolved light/dark theme at runtime.
        background_color: "#f6f1e6",
        theme_color: "#f6f1e6",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icons/monochrome-512.png", sizes: "512x512", type: "image/png", purpose: "monochrome" },
        ],
      },
      workbox: {
        // Precache the app shell only (ADR 0001): built JS/CSS/HTML, fonts,
        // icons, manifest. There is NO runtimeCaching, so the service worker
        // never touches Firestore or AI traffic — those stay pure network.
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,webmanifest}"],
        // Offline navigations fall back to the cached shell, except Firebase's
        // reserved auth/init paths, which must reach the network, and the
        // static legal pages (public/*.html), which are their own documents —
        // they are precached, so they still open offline.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/__\//, /^\/(terms|privacy|refunds)(\.html)?$/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // AI_BENCH=1 builds also ship the AI bench page (/ai-bench.html) so it can
  // run against real App Check: always on PR previews, and on live only while
  // the merge workflow sets it (temporary, pre-launch).
  build: process.env.AI_BENCH
    ? {
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, "index.html"),
            aiBench: path.resolve(__dirname, "ai-bench.html"),
          },
        },
      }
    : undefined,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})

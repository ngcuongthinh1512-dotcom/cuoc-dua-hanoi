import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Phase 6 dev loop (docs/plans/phase6.md §3.10): Vite serves the client with HMR, `npm run dev:api` runs wrangler dev on
  // :8787 (Worker + Durable Object + SQLite); /api (incl. the WebSocket upgrade) is proxied there. Same-origin in PROD.
  server: { proxy: { '/api': { target: 'http://localhost:8787', ws: true } } },
  build: {
    // Two pages: the game and the Host screen (/host.html). The other *.html files (character, bike, npc, hall, preview,
    // hudtest) are dev-only tools served by `vite` only.
    rolldownOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), host: resolve(import.meta.dirname, 'host.html') } },
    // @dimforge/rapier3d-compat inlines its WASM as base64 (~4.3 MB of the ~4.9 MB / 1.8 MB gzip bundle in Phase 1).
    // The limit leaves ~1 MB headroom, so real growth of three.js + our code still warns.
    // ponytail: one chunk; switch to @dimforge/rapier3d (separate .wasm) or split a vendor chunk when load time matters (Phase 12).
    chunkSizeWarningLimit: 6000, // kB
  },
});

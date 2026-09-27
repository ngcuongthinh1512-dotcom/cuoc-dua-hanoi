import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // @dimforge/rapier3d-compat inlines its WASM as base64 (~4.3 MB of the ~4.9 MB / 1.8 MB gzip bundle in Phase 1).
    // The limit leaves ~1 MB headroom, so real growth of three.js + our code still warns.
    // ponytail: one chunk; switch to @dimforge/rapier3d (separate .wasm) or split a vendor chunk when load time matters (Phase 12).
    chunkSizeWarningLimit: 6000, // kB
  },
});

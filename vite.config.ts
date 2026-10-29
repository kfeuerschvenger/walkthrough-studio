import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { socialMeta } from './vite-plugins/socialMeta.ts';

/**
 * Vite dev config.
 *
 * - Proxies `/api/*` to the Node backend on port 3001 so the frontend
 *   can call relative URLs and stay CORS-free in development.
 * - Proxies `/models/*` to the same backend, which serves `MODELS_DIR`
 *   when that variable is set, so `VITE_HOUSE_URL=/models/...` works in
 *   development as it does in the Docker image.
 * - Excludes `server/data/` from the file watcher so backend writes
 *   (autosaved scene + uploaded textures) don't trigger a full reload.
 */
const apiTarget = `http://127.0.0.1:${process.env.PORT ?? 3001}`;

export default defineConfig(({ mode }) => ({
  // `VITE_SITE_URL` (optional) turns the social preview image URLs absolute.
  plugins: [react(), socialMeta(loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_URL)],
  build: {
    // The `three` vendor chunk (about 1.1 MB minified) is intentionally one
    // file: it changes only on a three.js upgrade, so it stays cached across
    // deploys. The default 500 kB warning would always fire for it, so the
    // limit sits just above its size and still flags any other chunk that
    // grows past it.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Vendor chunks, so the rendering libraries cache independently of
        // application code and the two heavy routes share them instead of
        // owning a copy. The landing page loads only the `react` chunk;
        // `three` and `r3f` load with the walkthrough and texture routes.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: 'three', test: /node_modules[\\/](three|three-stdlib)[\\/]/ },
            { name: 'r3f', test: /node_modules[\\/](@react-three|its-fine|zustand|react-reconciler)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      // Literal loopback address: the API binds to 127.0.0.1 by default, and
      // `localhost` can resolve to the IPv6 `::1` first on some systems.
      // `changeOrigin` stays off on purpose: the API rejects a state-changing
      // request whose `Origin` differs from its `Host`, so the browser's
      // `Host` (localhost:5173) must reach it unchanged to match `Origin`.
      '/api': { target: apiTarget },
      '/models': { target: apiTarget },
    },
    watch: {
      ignored: ['**/server/data/**'],
    },
  },
}));

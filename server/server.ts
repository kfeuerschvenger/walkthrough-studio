import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import { createApp, DEFAULT_DIST_DIR } from './app.js';
import { drainWrites, ensureDirs } from './store.js';

const PORT = Number.parseInt(process.env.PORT ?? '3001', 10);

/**
 * Interface the server binds to. Loopback by default so a dev machine
 * never exposes the API (which has no authentication) to its network;
 * set `HOST=0.0.0.0` deliberately to serve other devices (the Docker
 * image does, and publishes the port on loopback only).
 */
const HOST = process.env.HOST ?? '127.0.0.1';

/** Longest wait for in-flight requests and writes before a forced exit. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Binds the listening socket. Resolves once the port is bound and rejects
 * with the bind error (for example `EADDRINUSE`): Express 5 hands that
 * error to the `listen` callback instead of throwing it.
 */
function listen(app: ReturnType<typeof createApp>): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, HOST, (err?: Error) => {
      if (err) reject(err);
      else resolve(server);
    });
  });
}

/**
 * Stops accepting connections, lets in-flight requests finish, waits for
 * the store write queue to drain, then exits. A second signal is ignored,
 * and a timer forces exit code 1 if the drain takes longer than
 * {@link SHUTDOWN_TIMEOUT_MS}.
 */
function installShutdown(server: Server): void {
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down`);

    const timer = setTimeout(() => {
      console.error('[server] shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    server.close((closeErr) => {
      drainWrites()
        .catch(() => {})
        .finally(() => {
          if (closeErr) console.error('[server] error while closing:', closeErr);
          process.exit(closeErr ? 1 : 0);
        });
    });
    server.closeIdleConnections();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Entry point: creates the data folders, binds the port, installs the
 * shutdown handlers and logs how the frontend is served. Any startup
 * failure, including a port already in use, is logged by the caller and
 * ends the process with exit code 1.
 */
async function start(): Promise<void> {
  await ensureDirs();
  const app = createApp();
  const server = await listen(app);
  // The `listen` promise only covers the bind. Later socket errors would
  // otherwise go unreported, so they are logged and end the process.
  server.on('error', (err) => {
    console.error('[server] server error:', err);
    process.exit(1);
  });
  installShutdown(server);

  console.log(`[server] listening on http://${HOST}:${PORT}`);
  if (existsSync(DEFAULT_DIST_DIR)) {
    console.log('[server] serving built frontend from dist/');
  } else {
    console.log('[server] frontend is expected to run separately (vite dev)');
  }
  const modelsDir = process.env.MODELS_DIR;
  if (modelsDir && existsSync(modelsDir)) {
    console.log(`[server] serving models read-only from ${modelsDir} at /models/`);
  }
}

start().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});

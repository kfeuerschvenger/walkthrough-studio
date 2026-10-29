import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import express from 'express';
import sceneRouter from './routes/scene.js';
import texturesRouter from './routes/textures.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Repository root. The compiled server lives one level deeper
 * (`dist-server/server/`, because `shared/` is compiled beside it) than the
 * source server (`server/`), so the root is found by checking which of the
 * two layouts the running file sits in.
 */
const projectRoot =
  path.basename(path.resolve(here, '..')) === 'dist-server'
    ? path.resolve(here, '..', '..')
    : path.resolve(here, '..');

/**
 * Default path of the Vite build output. Resolves to the same folder
 * whether the server runs from `server/` (tsx) or from
 * `dist-server/server/` (compiled), because `dist/` sits at the root.
 */
export const DEFAULT_DIST_DIR = path.join(projectRoot, 'dist');

/** Options for {@link createApp}. Every field has an environment default. */
export type AppOptions = {
  /**
   * Folder holding the built SPA. When it exists the app serves it and
   * falls back to `index.html` for client-side routes; when it does not
   * (`npm run dev`) the app is API-only.
   */
  distDir?: string;
  /**
   * Optional folder of private model files, served read-only under
   * `/models/`. Defaults to the `MODELS_DIR` environment variable.
   */
  modelsDir?: string;
};

/**
 * Content Security Policy for the built SPA. Scripts and styles come from
 * the same origin only (React writes inline `style` attributes, hence
 * `'unsafe-inline'` for styles). three.js decodes embedded model textures
 * through `blob:` and `data:` URLs, so those are allowed for images and
 * fetches, and `blob:` workers are allowed for loaders that spawn them.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Request methods that never change server state. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Hostnames always accepted in the `Host` header. */
const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

/** Extracts the lowercase hostname (no port) from a `Host` header value. */
function hostnameOf(hostHeader: string): string {
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Hostnames the server answers to: loopback names, the configured `HOST`
 * (unless it is a wildcard bind address), and any comma-separated names in
 * `ALLOWED_HOSTS` (for serving other devices by LAN name or address).
 * Anything else is a request addressed to a name the operator never chose,
 * which is the signature of a DNS rebinding attack.
 */
function allowedHostnames(): Set<string> {
  const names = new Set(LOOPBACK_HOSTNAMES);
  const configured = (process.env.HOST ?? '').trim().toLowerCase();
  if (configured && configured !== '0.0.0.0' && configured !== '::') {
    names.add(configured.startsWith('[') || !configured.includes(':') ? configured : `[${configured}]`);
  }
  for (const entry of (process.env.ALLOWED_HOSTS ?? '').split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    // A bare IPv6 address (`::1`) has to be bracketed before it can be parsed
    // as a host; `host:port` and `[v6]:port` entries are reduced to the name.
    const isBareIpv6 = !trimmed.startsWith('[') && trimmed.split(':').length > 2;
    const hostname = hostnameOf(isBareIpv6 ? `[${trimmed}]` : trimmed);
    if (hostname) names.add(hostname);
  }
  return names;
}

/**
 * Builds the Express application without binding a port, so the same
 * instance can be started by `server.ts` or driven directly by tests.
 */
export function createApp(options: AppOptions = {}): express.Express {
  const distDir = options.distDir ?? DEFAULT_DIST_DIR;
  const modelsDir = options.modelsDir ?? process.env.MODELS_DIR;
  const hosts = allowedHostnames();

  const app = express();
  app.disable('x-powered-by');

  // Baseline response headers. The texture route replaces the CSP with a
  // stricter one for image bytes.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    next();
  });

  // The API has no authentication, so it must only answer the browser that
  // belongs to this machine. A `Host` outside the allow-list is rejected
  // (DNS rebinding), and a state-changing request whose `Origin` is not the
  // origin it is addressed to is rejected (cross-site request forgery).
  // Requests without an `Origin` (curl, server-side callers) pass.
  app.use((req, res, next) => {
    if (!hosts.has(hostnameOf(req.headers.host ?? ''))) {
      res.status(403).json({ error: 'forbidden host' });
      return;
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !SAFE_METHODS.has(req.method)) {
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        // `Origin: null` and unparseable values fall through to rejection.
      }
      if (originHost.toLowerCase() !== (req.headers.host ?? '').toLowerCase()) {
        res.status(403).json({ error: 'forbidden origin' });
        return;
      }
    }
    next();
  });

  // Scene payload is tiny in practice (a few KB) but face paints can
  // accumulate, so the JSON limit is raised to keep the autosave PUT from
  // being rejected with a 413.
  app.use(express.json({ limit: '2mb' }));

  app.use('/api/scene', sceneRouter);
  app.use('/api/textures', texturesRouter);

  /**
   * `GET /api/health`
   *
   * Liveness probe used by the container healthcheck. Always 200 with
   * `{ ok: true }` while the process can answer requests.
   */
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Unknown API paths answer JSON, never the SPA shell or an HTML error page.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  // Private model files are mounted into the container rather than baked
  // into the image. `express.static` only reads, so the mount can be
  // read-only, and a missing file is a plain 404 instead of the SPA shell.
  // The 404 handler is registered whether or not a folder is mounted, so
  // `/models` never falls through to the SPA shell or the default HTML page.
  if (modelsDir && existsSync(modelsDir)) {
    app.use('/models', express.static(modelsDir));
  }
  app.use('/models', (_req, res) => {
    res.status(404).end();
  });

  if (existsSync(distDir)) {
    // Production mode: serve the built SPA. Fall back to `index.html` for
    // client-side routes (anything that isn't `/api/*` or `/models/*`). A
    // path with a file extension is an asset request, so a miss is a real
    // 404 rather than an HTML document masquerading as a script or image.
    app.use(express.static(distDir));
    app.get(/^\/(?!api\/|models\/).*/, (req, res) => {
      if (path.extname(req.path)) {
        res.status(404).end();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Centralized error handler. Body-parser failures (malformed JSON, body
  // over the limit) carry a 4xx `status` and are the client's fault, so
  // they are reported as such. Everything else is logged and answered
  // with a generic 500; the error message is never echoed to the client.
  // Express identifies error middleware by its four-argument signature,
  // so the unused `_next` has to stay.
  app.use(
    (
      err: Error & { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = err.status;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        if (!res.headersSent) {
          res.status(status).json({ error: status === 413 ? 'payload too large' : 'bad request' });
        }
        return;
      }
      console.error('[server] unhandled error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal server error' });
      }
    },
  );

  return app;
}

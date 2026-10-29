import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Response } from 'superagent';
import { vi } from 'vitest';

/** A fresh, isolated copy of the server modules bound to a temp data dir. */
export type Sandbox = {
  /** Temporary folder standing in for `DATA_DIR`. */
  dataDir: string;
  /** The `store.ts` module instance that writes into {@link Sandbox.dataDir}. */
  store: typeof import('../store.js');
  /** The `app.ts` module instance that shares that store. */
  appModule: typeof import('../app.js');
  /** Removes the temp folder and restores the environment. */
  cleanup: () => Promise<void>;
};

/**
 * Points `DATA_DIR` at a new temp folder and imports fresh copies of the
 * store and the app. `store.ts` reads `DATA_DIR` once at import time, so the
 * module registry is reset first: without it every test would share the
 * first folder. The real `server/data` is never touched.
 */
export async function createSandbox(): Promise<Sandbox> {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'walkthrough-test-'));
  vi.stubEnv('DATA_DIR', dataDir);
  vi.resetModules();
  const store = await import('../store.js');
  const appModule = await import('../app.js');
  return {
    dataDir,
    store,
    appModule,
    cleanup: async () => {
      vi.unstubAllEnvs();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

/** A random folder under the OS temp dir, for static-file fixtures. */
export function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
}

/** supertest body parser that keeps a response as a raw `Buffer`. */
export function binary(
  res: Response,
  callback: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

/** Smallest buffer the sniffer accepts as a PNG (signature plus padding). */
export const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16, 1),
]);

/** A valid scene document with one entry of each kind. */
export function sampleScene() {
  return {
    bodies: [{ bodyName: 'Wall', textureId: '3b241101-e2bb-4255-8caf-4136c566a962' }],
    faces: [
      {
        bodyName: 'Wall',
        seedTriIndex: 4,
        normalToleranceDeg: 12,
        textureId: '3b241101-e2bb-4255-8caf-4136c566a962',
      },
    ],
    lights: [
      {
        id: 'light-1',
        shape: 'sphere',
        position: [1, 2, 3],
        scale: [1, 1, 1],
        rotation: [0, 0, 0],
        color: '#ffcc88',
        intensity: 5,
      },
    ],
    hour: 9.5,
  };
}

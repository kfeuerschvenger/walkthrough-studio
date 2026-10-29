// Starts a private copy of the app for the capture run: an API on a throwaway
// data folder and the production build of the frontend, both on their own
// ports, so a development server on the usual ports is never touched.
//
// Two guarantees come from here:
//
//  - The model is always the bundled demo house. The Vite process receives
//    every house variable explicitly, and process variables win over the
//    `.env.local` file of whoever runs this, so a private model configured
//    there cannot leak into a picture.
//  - The data is always the demo seed. DATA_DIR is a fresh folder under the
//    system temp directory, never the repository's `server/data`.

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, '..', '..');

/** The model every capture shows, as the app addresses it. */
export const DEMO_HOUSE_URL = '/demo/house.glb';

export const API_PORT = Number(process.env.SHOWCASE_API_PORT ?? 3917);
export const WEB_PORT = Number(process.env.SHOWCASE_WEB_PORT ?? 5917);
export const API_URL = `http://127.0.0.1:${API_PORT}/api`;
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

/**
 * House settings the frontend reads at build time. Each one is pinned to the
 * demo house's own default, so what the build bakes in does not depend on any
 * `.env` file.
 */
const HOUSE_ENV = {
  VITE_HOUSE_URL: DEMO_HOUSE_URL,
  VITE_HOUSE_SPAWN: '',
  VITE_HOUSE_GROUND_HINTS: '',
  VITE_SUN_PATH_ROTATION_DEG: '',
  VITE_SITE_URL: '',
};

const nodeBin = process.execPath;
const tsxCli = path.join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const viteCli = path.join(REPO, 'node_modules', 'vite', 'bin', 'vite.js');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Runs a command to completion and rejects with its output when it fails. */
const runToEnd = (args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(nodeBin, args, { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => (output += chunk));
    child.stderr.on('data', chunk => (output += chunk));
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve(output);
      else reject(new Error(`${path.basename(args[0])} ${args[1]} exited with ${code}\n${output.slice(-1500)}`));
    });
  });

/** Starts a long-lived process and keeps its output for the error message. */
const startProcess = (args, env) => {
  const child = spawn(nodeBin, args, { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const state = { output: '', exited: false };
  child.stdout.on('data', chunk => (state.output += chunk));
  child.stderr.on('data', chunk => (state.output += chunk));
  child.on('exit', () => (state.exited = true));
  return { child, state };
};

/** Polls a URL until it answers 2xx, or throws with the process output. */
const waitFor = async (url, { child, state }, label) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (state.exited) throw new Error(`${label} exited early\n${state.output.slice(-1500)}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await sleep(500);
  }
  child.kill();
  throw new Error(`${label} did not answer at ${url}\n${state.output.slice(-1500)}`);
};

/**
 * Builds the frontend into a temp folder and serves it next to a fresh API.
 *
 * @returns {Promise<{ web: string, api: string, dataDir: string, stop: () => Promise<void> }>}
 */
export const startStack = async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'walkthrough-showcase-'));
  const distDir = path.join(dataDir, 'dist');

  // The same value reaches both processes, since the dev proxy reads it to
  // find the API.
  const base = { ...process.env, PORT: String(API_PORT), HOST: '127.0.0.1', DATA_DIR: dataDir, MODELS_DIR: '' };
  const frontendEnv = { ...base, ...HOUSE_ENV };

  await runToEnd([viteCli, 'build', '--outDir', distDir, '--emptyOutDir', '--logLevel', 'error'], frontendEnv);

  const api = startProcess([tsxCli, path.join('server', 'server.ts')], base);
  const web = startProcess(
    [viteCli, 'preview', '--outDir', distDir, '--port', String(WEB_PORT), '--strictPort', '--host', '127.0.0.1'],
    frontendEnv
  );

  const stop = async () => {
    api.child.kill();
    web.child.kill();
    await sleep(500);
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
  };

  try {
    await waitFor(`${API_URL}/health`, api, 'the API');
    await waitFor(`${WEB_URL}/`, web, 'the web server');
  } catch (error) {
    await stop();
    throw error;
  }

  return { web: WEB_URL, api: API_URL, dataDir, stop };
};

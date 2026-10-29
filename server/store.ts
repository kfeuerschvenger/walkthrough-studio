import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SCENE,
  EMPTY_MANIFEST,
  type SceneState,
  type TextureManifest,
} from './types.js';
import { isTextureId } from './validation.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Runtime data root. Defaults to `server/data` next to `server.ts`, which
 * is git-ignored so it never leaks into the bundle or version control.
 * The `DATA_DIR` environment variable relocates it (tests and throwaway
 * experiments point it at a temporary folder).
 */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(here, 'data');

/** Absolute path of the persisted scene document. */
export const SCENE_PATH = path.join(DATA_DIR, 'scene.json');

/** Folder holding the texture manifest and the texture blobs. */
export const TEXTURES_DIR = path.join(DATA_DIR, 'textures');

/** Folder holding one file per texture, named after the texture id. */
export const BLOBS_DIR = path.join(TEXTURES_DIR, 'blobs');

/** Absolute path of the texture manifest. */
export const MANIFEST_PATH = path.join(TEXTURES_DIR, 'manifest.json');

/** Marker `writeAtomic` puts in the name of its temporary sibling files. */
const TMP_MARKER = '.tmp-';

/**
 * Ensures every directory the store touches exists, then reclaims what an
 * interrupted run left behind (see {@link sweepStaleFiles}). Idempotent.
 * Meant to run once at startup, before the server accepts requests.
 */
export async function ensureDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(BLOBS_DIR, { recursive: true });
  await sweepStaleFiles();
}

/** Names of the entries of `dir`, or an empty list when it cannot be read. */
async function listDir(dir: string): Promise<string[]> {
  return fs.readdir(dir).catch(() => []);
}

/**
 * Removes the leftovers of a crash: `.tmp-` files that `writeAtomic` never
 * got to rename or delete, in the data, textures and blobs folders, and blobs
 * no manifest entry refers to (an upload that wrote its blob and died before
 * the manifest update). Orphans are only reclaimed when the manifest exists
 * and parses, because an unreadable manifest would make every blob look
 * orphaned. Failures to delete are ignored: the next startup tries again.
 */
async function sweepStaleFiles(): Promise<void> {
  let tempFiles = 0;
  for (const dir of [DATA_DIR, TEXTURES_DIR, BLOBS_DIR]) {
    for (const name of await listDir(dir)) {
      if (!name.includes(TMP_MARKER)) continue;
      const removed = await fs.unlink(path.join(dir, name)).then(() => true, () => false);
      if (removed) tempFiles++;
    }
  }

  let orphanBlobs = 0;
  const referenced = await readReferencedTextureIds();
  if (referenced) {
    for (const name of await listDir(BLOBS_DIR)) {
      if (!isTextureId(name) || referenced.has(name)) continue;
      const removed = await fs.unlink(path.join(BLOBS_DIR, name)).then(() => true, () => false);
      if (removed) orphanBlobs++;
    }
  } else if ((await listDir(BLOBS_DIR)).some((name) => isTextureId(name))) {
    console.warn('[store] texture manifest missing or unreadable, orphan blobs were not reclaimed');
  }

  if (tempFiles > 0 || orphanBlobs > 0) {
    console.log(
      `[store] startup cleanup removed ${tempFiles} stale temp file(s) and ${orphanBlobs} orphan blob(s)`,
    );
  }
}

/**
 * Ids listed in the manifest, or `null` when the manifest cannot be trusted
 * (missing, not JSON, or without a `textures` array).
 */
async function readReferencedTextureIds(): Promise<Set<string> | null> {
  try {
    const doc = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as Partial<TextureManifest>;
    if (!Array.isArray(doc.textures)) return null;
    return new Set(doc.textures.map((record) => record.id));
  } catch {
    return null;
  }
}

/**
 * Writes `data` to `filePath` atomically: write to a `.tmp` sibling
 * first, then `rename` over the target. `rename` is atomic on every
 * supported OS, so a reader can never observe a partial file even if
 * the process crashes mid-write. The temp file is removed when the
 * write or the rename fails.
 */
async function writeAtomic(filePath: string, data: string | Buffer): Promise<void> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmp = `${filePath}.tmp-${suffix}`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, filePath);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

/**
 * Simple FIFO write queue. Every persistence operation goes through
 * `serialize()` so concurrent requests can't read a stale value, modify
 * it, and overwrite each other's changes. The queue is process-local:
 * the assumption is one server process per data directory.
 */
let writeChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => {});
  return next as Promise<T>;
}

/**
 * Resolves once every operation already queued has settled. Used by the
 * shutdown path so an in-flight write is never cut off by `process.exit`.
 * Operations queued after the call are not awaited.
 */
export async function drainWrites(): Promise<void> {
  await writeChain;
}

/**
 * Renames an unparseable file to `<name>.corrupt-<timestamp>`. Runs under
 * the write queue so it cannot interleave with a write that is replacing
 * the same file, and re-reads the file first so a document that was
 * rewritten in the meantime is never moved aside.
 */
function quarantine(filePath: string, corruptContent: string, alreadyQueued: boolean): Promise<void> {
  const run = async (): Promise<void> => {
    const current = await fs.readFile(filePath, 'utf8').catch(() => null);
    if (current !== corruptContent) return;
    const backup = `${filePath}.corrupt-${Date.now()}`;
    console.error(`[store] ${path.basename(filePath)} is not valid JSON, backing up to ${path.basename(backup)}`);
    await fs.rename(filePath, backup).catch((renameErr) => {
      console.error('[store] could not back up the corrupt file', renameErr);
    });
  };
  return alreadyQueued ? run() : serialize(run);
}

/**
 * Reads and parses a JSON document. Returns `null` when the file does
 * not exist. A file that exists but cannot be parsed is renamed to
 * `<name>.corrupt-<timestamp>` and reported as missing, so one bad write
 * degrades to defaults instead of failing every request until someone
 * deletes the file by hand. Pass `alreadyQueued` when the caller runs
 * inside {@link serialize}, because the queue is not re-entrant.
 */
async function readJsonOrQuarantine(
  filePath: string,
  alreadyQueued = false,
): Promise<unknown | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    await quarantine(filePath, raw, alreadyQueued);
    return null;
  }
}

/* ---------- Scene ---------- */

/**
 * Reads `scene.json`. Returns the default scene if the file is missing
 * or corrupt (the corrupt file is kept as a backup).
 */
export async function readScene(): Promise<SceneState> {
  const parsed = await readJsonOrQuarantine(SCENE_PATH);
  if (typeof parsed !== 'object' || parsed === null) {
    // Fresh arrays: a spread of the default would share its collections
    // with every caller.
    return { ...DEFAULT_SCENE, bodies: [], faces: [], lights: [] };
  }
  const doc = parsed as Partial<SceneState>;
  return {
    bodies: Array.isArray(doc.bodies) ? doc.bodies : [],
    faces: Array.isArray(doc.faces) ? doc.faces : [],
    lights: Array.isArray(doc.lights) ? doc.lights : [],
    hour: typeof doc.hour === 'number' ? doc.hour : DEFAULT_SCENE.hour,
  };
}

/** Serialized full-replacement write of the scene document. */
export function writeScene(state: SceneState): Promise<void> {
  return serialize(() =>
    writeAtomic(SCENE_PATH, JSON.stringify({ version: 1, ...state }, null, 2)),
  );
}

/* ---------- Textures ---------- */

/**
 * Reads the texture manifest. Internal: callers go through
 * {@link updateManifest} for any read-modify-write to avoid races.
 */
async function readManifestInternal(alreadyQueued = false): Promise<TextureManifest> {
  const parsed = await readJsonOrQuarantine(MANIFEST_PATH, alreadyQueued);
  if (typeof parsed !== 'object' || parsed === null) {
    // Fresh array: a spread of the default would share its collection with
    // every caller.
    return { ...EMPTY_MANIFEST, textures: [] };
  }
  const doc = parsed as Partial<TextureManifest>;
  return {
    ...EMPTY_MANIFEST,
    textures: Array.isArray(doc.textures) ? doc.textures : [],
  };
}

/** Public read, safe to call concurrently with itself. */
export function readManifest(): Promise<TextureManifest> {
  return readManifestInternal();
}

/**
 * Atomically read-modify-write the manifest. The modifier receives the
 * current manifest, returns the next one, and the whole exchange runs
 * under the write queue so two concurrent uploads never lose updates to
 * each other. A modifier that returns the manifest it received unchanged
 * (the same object) signals "nothing to do", and the write is skipped.
 */
export function updateManifest(
  modifier: (current: TextureManifest) => TextureManifest | Promise<TextureManifest>,
): Promise<TextureManifest> {
  return serialize(async () => {
    const current = await readManifestInternal(true);
    const next = await modifier(current);
    if (next !== current) {
      await writeAtomic(MANIFEST_PATH, JSON.stringify(next, null, 2));
    }
    return next;
  });
}

/**
 * Filesystem path of a texture blob given its id. Throws unless `id` is
 * a UUID, so a path fragment such as `..` can never reach the
 * filesystem through this function.
 */
export function blobPath(id: string): string {
  if (!isTextureId(id)) throw new Error('invalid texture id');
  return path.join(BLOBS_DIR, id);
}

/** Writes a blob to disk atomically. */
export async function writeBlob(id: string, data: Buffer): Promise<void> {
  await writeAtomic(blobPath(id), data);
}

/** Deletes a blob from disk. Silently ignores a missing file. */
export async function deleteBlob(id: string): Promise<void> {
  try {
    await fs.unlink(blobPath(id));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

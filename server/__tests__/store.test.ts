import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSandbox, sampleScene, type Sandbox } from './helpers.js';

const ID_A = '3b241101-e2bb-4255-8caf-4136c566a962';

function record(id: string, scale = 1) {
  return { id, filename: `${id}.png`, scale, createdAt: 1, mimeType: 'image/png' };
}

let sandbox: Sandbox;

beforeEach(async () => {
  sandbox = await createSandbox();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await sandbox.cleanup();
});

describe('data directory', () => {
  it('derives every path from DATA_DIR', () => {
    const { store, dataDir } = sandbox;
    expect(store.DATA_DIR).toBe(path.resolve(dataDir));
    expect(store.SCENE_PATH).toBe(path.join(dataDir, 'scene.json'));
    expect(store.BLOBS_DIR).toBe(path.join(dataDir, 'textures', 'blobs'));
    expect(store.MANIFEST_PATH).toBe(path.join(dataDir, 'textures', 'manifest.json'));
  });

  it('falls back to server/data when DATA_DIR is unset', async () => {
    vi.stubEnv('DATA_DIR', undefined);
    vi.resetModules();
    const store = await import('../store.js');
    expect(store.DATA_DIR.endsWith(path.join('server', 'data'))).toBe(true);
  });

  it('creates the folders idempotently', async () => {
    await sandbox.store.ensureDirs();
    await sandbox.store.ensureDirs();
    const stat = await fs.stat(sandbox.store.BLOBS_DIR);
    expect(stat.isDirectory()).toBe(true);
  });
});

describe('startup cleanup', () => {
  const ID_B = '9f3c5f0e-6a58-4d53-a3a0-0d3f1c1b7e11';

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('removes stale temp files from the data, textures and blobs folders', async () => {
    const { store } = sandbox;
    await store.ensureDirs();
    const stale = [
      path.join(store.DATA_DIR, 'scene.json.tmp-1-abc'),
      path.join(store.TEXTURES_DIR, 'manifest.json.tmp-2-def'),
      path.join(store.BLOBS_DIR, `${ID_A}.tmp-3-ghi`),
    ];
    await Promise.all(stale.map((file) => fs.writeFile(file, 'partial')));
    await fs.writeFile(store.SCENE_PATH, '{}');

    await store.ensureDirs();

    for (const file of stale) await expect(fs.stat(file)).rejects.toThrow();
    expect(await fs.readFile(store.SCENE_PATH, 'utf8')).toBe('{}');
  });

  it('removes blobs the manifest does not reference and keeps the others', async () => {
    const { store } = sandbox;
    await store.ensureDirs();
    await store.updateManifest((current) => ({ ...current, textures: [record(ID_A)] }));
    await fs.writeFile(store.blobPath(ID_A), 'kept');
    await fs.writeFile(store.blobPath(ID_B), 'orphan');
    await fs.writeFile(path.join(store.BLOBS_DIR, 'notes.txt'), 'not a blob');

    await store.ensureDirs();

    expect(await fs.readFile(store.blobPath(ID_A), 'utf8')).toBe('kept');
    await expect(fs.stat(store.blobPath(ID_B))).rejects.toThrow();
    expect(await fs.readFile(path.join(store.BLOBS_DIR, 'notes.txt'), 'utf8')).toBe('not a blob');
  });

  it('keeps every blob when the manifest is unreadable', async () => {
    const { store } = sandbox;
    await store.ensureDirs();
    await fs.writeFile(store.blobPath(ID_A), 'kept');
    await fs.writeFile(store.MANIFEST_PATH, '{ not json');

    await store.ensureDirs();

    expect(await fs.readFile(store.blobPath(ID_A), 'utf8')).toBe('kept');
  });

  it('keeps every blob when there is no manifest yet', async () => {
    const { store } = sandbox;
    await store.ensureDirs();
    await fs.writeFile(store.blobPath(ID_A), 'kept');

    await store.ensureDirs();

    expect(await fs.readFile(store.blobPath(ID_A), 'utf8')).toBe('kept');
  });
});

describe('scene', () => {
  it('returns the default scene when nothing was saved', async () => {
    expect(await sandbox.store.readScene()).toEqual({ bodies: [], faces: [], lights: [], hour: 12 });
  });

  it('returns a copy of the default so callers cannot mutate it', async () => {
    const first = await sandbox.store.readScene();
    first.bodies.push({ bodyName: 'x', textureId: 'y' });
    expect((await sandbox.store.readScene()).bodies).toEqual([]);
  });

  it('round-trips a scene and stamps the document version', async () => {
    await sandbox.store.ensureDirs();
    const scene = sampleScene() as Parameters<typeof sandbox.store.writeScene>[0];
    await sandbox.store.writeScene(scene);
    expect(await sandbox.store.readScene()).toEqual(scene);
    const onDisk = JSON.parse(await fs.readFile(sandbox.store.SCENE_PATH, 'utf8'));
    expect(onDisk.version).toBe(1);
  });

  it('normalizes a document with missing or mistyped fields', async () => {
    await sandbox.store.ensureDirs();
    await fs.writeFile(
      sandbox.store.SCENE_PATH,
      JSON.stringify({ bodies: 'nope', faces: [{ a: 1 }], hour: 'late' }),
    );
    expect(await sandbox.store.readScene()).toEqual({
      bodies: [],
      faces: [{ a: 1 }],
      lights: [],
      hour: 12,
    });
  });

  it('falls back to the default for a non-object document', async () => {
    await sandbox.store.ensureDirs();
    await fs.writeFile(sandbox.store.SCENE_PATH, '42');
    expect((await sandbox.store.readScene()).hour).toBe(12);
  });

  it('quarantines a corrupt file and serves the default', async () => {
    await sandbox.store.ensureDirs();
    await fs.writeFile(sandbox.store.SCENE_PATH, '{"bodies": [');

    expect(await sandbox.store.readScene()).toEqual({ bodies: [], faces: [], lights: [], hour: 12 });

    const files = await fs.readdir(sandbox.dataDir);
    expect(files).not.toContain('scene.json');
    const backup = files.find((name) => name.startsWith('scene.json.corrupt-'));
    expect(backup).toBeDefined();
    expect(await fs.readFile(path.join(sandbox.dataDir, backup!), 'utf8')).toBe('{"bodies": [');
  });

  it('accepts a new write after quarantining a corrupt file', async () => {
    await sandbox.store.ensureDirs();
    await fs.writeFile(sandbox.store.SCENE_PATH, 'garbage');
    await sandbox.store.readScene();
    await sandbox.store.writeScene({ bodies: [], faces: [], lights: [], hour: 3 });
    expect((await sandbox.store.readScene()).hour).toBe(3);
  });

  it('rethrows read errors other than a missing file', async () => {
    await sandbox.store.ensureDirs();
    await fs.mkdir(sandbox.store.SCENE_PATH);
    await expect(sandbox.store.readScene()).rejects.toMatchObject({ code: 'EISDIR' });
  });
});

describe('atomic writes', () => {
  it('leaves no temporary files behind', async () => {
    await sandbox.store.ensureDirs();
    await sandbox.store.writeScene({ bodies: [], faces: [], lights: [], hour: 1 });
    expect(await fs.readdir(sandbox.dataDir)).toEqual(['scene.json', 'textures']);
  });

  it('keeps the previous content and removes the temp file when the rename fails', async () => {
    await sandbox.store.ensureDirs();
    await sandbox.store.writeScene({ bodies: [], faces: [], lights: [], hour: 1 });

    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('disk full'));
    await expect(
      sandbox.store.writeScene({ bodies: [], faces: [], lights: [], hour: 2 }),
    ).rejects.toThrow('disk full');

    expect(await fs.readdir(sandbox.dataDir)).toEqual(['scene.json', 'textures']);
    expect((await sandbox.store.readScene()).hour).toBe(1);
  });
});

describe('write queue', () => {
  it('applies concurrent scene writes in submission order', async () => {
    await sandbox.store.ensureDirs();
    const writes = Array.from({ length: 25 }, (_, hour) =>
      sandbox.store.writeScene({ bodies: [], faces: [], lights: [], hour }),
    );
    await Promise.all(writes);
    expect((await sandbox.store.readScene()).hour).toBe(24);
  });

  it('never loses a manifest update under concurrency', async () => {
    await sandbox.store.ensureDirs();
    const ids = Array.from({ length: 30 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    await Promise.all(
      ids.map((id) =>
        sandbox.store.updateManifest((current) => ({
          ...current,
          textures: [...current.textures, record(id)],
        })),
      ),
    );
    const manifest = await sandbox.store.readManifest();
    expect(manifest.textures.map((t) => t.id)).toEqual(ids);
  });

  it('keeps serving the queue after a modifier throws', async () => {
    await sandbox.store.ensureDirs();
    const failing = sandbox.store.updateManifest(() => {
      throw new Error('modifier failed');
    });
    const following = sandbox.store.updateManifest((current) => ({
      ...current,
      textures: [record(ID_A)],
    }));
    await expect(failing).rejects.toThrow('modifier failed');
    expect((await following).textures).toHaveLength(1);
  });

  it('does not write the manifest when the modifier throws', async () => {
    await sandbox.store.ensureDirs();
    await expect(
      sandbox.store.updateManifest(() => {
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');
    await expect(fs.access(sandbox.store.MANIFEST_PATH)).rejects.toThrow();
  });

  it('supports an async modifier', async () => {
    await sandbox.store.ensureDirs();
    const next = await sandbox.store.updateManifest(async (current) => ({
      ...current,
      textures: [record(ID_A, 3)],
    }));
    expect(next.textures[0].scale).toBe(3);
  });
});

describe('manifest', () => {
  it('starts empty', async () => {
    expect(await sandbox.store.readManifest()).toEqual({ version: 1, textures: [] });
  });

  it('normalizes a mistyped textures field', async () => {
    await sandbox.store.ensureDirs();
    await fs.writeFile(sandbox.store.MANIFEST_PATH, JSON.stringify({ textures: 'x' }));
    expect(await sandbox.store.readManifest()).toEqual({ version: 1, textures: [] });
  });

  it('quarantines a corrupt manifest once when several reads race', async () => {
    await sandbox.store.ensureDirs();
    await fs.writeFile(sandbox.store.MANIFEST_PATH, '{{{');
    const reads = await Promise.all([
      sandbox.store.readManifest(),
      sandbox.store.readManifest(),
      sandbox.store.readManifest(),
    ]);
    expect(reads.every((m) => m.textures.length === 0)).toBe(true);
    const files = await fs.readdir(path.dirname(sandbox.store.MANIFEST_PATH));
    expect(files.filter((name) => name.startsWith('manifest.json.corrupt-'))).toHaveLength(1);
  });

  it('does not move aside a manifest that was rewritten after the failed read', async () => {
    await sandbox.store.ensureDirs();
    await fs.writeFile(sandbox.store.MANIFEST_PATH, '{{{');
    const read = sandbox.store.readManifest();
    // Queued ahead of the quarantine step: replaces the corrupt content.
    const write = sandbox.store.updateManifest((current) => ({
      ...current,
      textures: [record(ID_A)],
    }));
    await Promise.all([read, write]);
    expect((await sandbox.store.readManifest()).textures).toHaveLength(1);
  });

  it('skips the write when the modifier returns the manifest unchanged', async () => {
    await sandbox.store.ensureDirs();
    await sandbox.store.updateManifest((current) => current);
    await expect(fs.access(sandbox.store.MANIFEST_PATH)).rejects.toThrow();
  });

  it('drains queued writes', async () => {
    await sandbox.store.ensureDirs();
    const write = sandbox.store.writeScene({ bodies: [], faces: [], lights: [], hour: 7 });
    await sandbox.store.drainWrites();
    expect(JSON.parse(await fs.readFile(sandbox.store.SCENE_PATH, 'utf8')).hour).toBe(7);
    await write;
  });

  it('quarantines a corrupt manifest and lets a new upload proceed', async () => {
    await sandbox.store.ensureDirs();
    await fs.writeFile(sandbox.store.MANIFEST_PATH, '{{{');
    const next = await sandbox.store.updateManifest((current) => ({
      ...current,
      textures: [record(ID_A)],
    }));
    expect(next.textures).toHaveLength(1);
    const files = await fs.readdir(path.dirname(sandbox.store.MANIFEST_PATH));
    expect(files.some((name) => name.startsWith('manifest.json.corrupt-'))).toBe(true);
  });
});

describe('blobs', () => {
  it('maps a UUID to a path inside the blobs folder', () => {
    expect(sandbox.store.blobPath(ID_A)).toBe(path.join(sandbox.store.BLOBS_DIR, ID_A));
  });

  it.each(['..', '../scene.json', 'a/b', '', 'not-a-uuid'])('refuses the id %j', (id) => {
    expect(() => sandbox.store.blobPath(id)).toThrow('invalid texture id');
  });

  it('writes and deletes a blob', async () => {
    await sandbox.store.ensureDirs();
    await sandbox.store.writeBlob(ID_A, Buffer.from([1, 2, 3]));
    expect(await fs.readFile(sandbox.store.blobPath(ID_A))).toEqual(Buffer.from([1, 2, 3]));
    expect(await fs.readdir(sandbox.store.BLOBS_DIR)).toEqual([ID_A]);

    await sandbox.store.deleteBlob(ID_A);
    expect(await fs.readdir(sandbox.store.BLOBS_DIR)).toEqual([]);
  });

  it('ignores deleting a blob that does not exist', async () => {
    await sandbox.store.ensureDirs();
    await expect(sandbox.store.deleteBlob(ID_A)).resolves.toBeUndefined();
  });

  it('rethrows delete errors other than a missing file', async () => {
    await sandbox.store.ensureDirs();
    await fs.mkdir(sandbox.store.blobPath(ID_A));
    await expect(sandbox.store.deleteBlob(ID_A)).rejects.toBeDefined();
  });

  it('refuses to write a blob under an invalid id', async () => {
    await expect(sandbox.store.writeBlob('../x', Buffer.alloc(1))).rejects.toThrow(
      'invalid texture id',
    );
  });
});

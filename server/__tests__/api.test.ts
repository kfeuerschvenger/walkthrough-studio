import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { binary, createSandbox, makeTempDir, PNG_BYTES, sampleScene, type Sandbox } from './helpers.js';

const UNKNOWN_ID = '9f3c5f0e-6a58-4d53-a3a0-0d3f1c1b7e11';

let sandbox: Sandbox;
let app: Express;

beforeEach(async () => {
  sandbox = await createSandbox();
  await sandbox.store.ensureDirs();
  // Point the SPA lookup at a folder that does not exist so these tests
  // exercise the API alone, whatever the developer has built in `dist/`.
  app = sandbox.appModule.createApp({ distDir: path.join(sandbox.dataDir, 'no-dist') });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await sandbox.cleanup();
});

async function uploadPng(name = 'brick.png') {
  return request(app).post('/api/textures').attach('file', PNG_BYTES, name);
}

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('scene routes', () => {
  it('serves the default scene on a fresh data dir', async () => {
    const res = await request(app).get('/api/scene');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ bodies: [], faces: [], lights: [], hour: 12 });
  });

  it('stores a valid scene and serves it back', async () => {
    const scene = sampleScene();
    const put = await request(app).put('/api/scene').send(scene);
    expect(put.status).toBe(204);

    const get = await request(app).get('/api/scene');
    expect(get.body).toEqual(scene);
  });

  it('strips unknown fields before they reach disk', async () => {
    await request(app)
      .put('/api/scene')
      .send({ ...sampleScene(), admin: true });
    const onDisk = JSON.parse(await fs.readFile(sandbox.store.SCENE_PATH, 'utf8'));
    expect(onDisk).not.toHaveProperty('admin');
    expect(onDisk.version).toBe(1);
  });

  it.each([
    ['an array body', []],
    ['a missing hour', { bodies: [], faces: [], lights: [] }],
    ['an hour out of range', { bodies: [], faces: [], lights: [], hour: 25 }],
    ['a non-array lights field', { bodies: [], faces: [], lights: 'x', hour: 1 }],
    ['an invalid light', { bodies: [], faces: [], lights: [{ id: 'a' }], hour: 1 }],
  ])('rejects %s with a 400', async (_label, body) => {
    const res = await request(app).put('/api/scene').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^invalid scene payload: /);
  });

  it('does not overwrite the stored scene with a rejected payload', async () => {
    await request(app).put('/api/scene').send(sampleScene());
    await request(app).put('/api/scene').send({ hour: 99 });
    expect((await request(app).get('/api/scene')).body.hour).toBe(9.5);
  });

  it('rejects malformed JSON with a 400', async () => {
    const res = await request(app)
      .put('/api/scene')
      .set('Content-Type', 'application/json')
      .send('{"hour": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'bad request' });
  });

  it('rejects a body over the 2 MB limit with a 413', async () => {
    const res = await request(app)
      .put('/api/scene')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ ...sampleScene(), pad: 'x'.repeat(2 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'payload too large' });
  });

  it('serves the default when scene.json is corrupt', async () => {
    await fs.writeFile(sandbox.store.SCENE_PATH, 'not json');
    const res = await request(app).get('/api/scene');
    expect(res.status).toBe(200);
    expect(res.body.hour).toBe(12);
  });

  it('answers a storage failure with a generic 500', async () => {
    await fs.mkdir(sandbox.store.SCENE_PATH);
    const res = await request(app).get('/api/scene');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal server error' });
    expect(JSON.stringify(res.body)).not.toContain(sandbox.dataDir);
  });
});

describe('texture upload', () => {
  it('stores a PNG and lists it', async () => {
    const res = await uploadPng();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ filename: 'brick.png', scale: 1, mimeType: 'image/png' });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);

    const list = await request(app).get('/api/textures');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(res.body.id);
    expect(await fs.readFile(sandbox.store.blobPath(res.body.id))).toEqual(PNG_BYTES);
  });

  it('derives the stored type from the bytes, not the declared type', async () => {
    const res = await request(app)
      .post('/api/textures')
      .attach('file', PNG_BYTES, { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    expect(res.body.mimeType).toBe('image/png');
  });

  it('rejects SVG even when it claims to be a PNG', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const res = await request(app)
      .post('/api/textures')
      .attach('file', svg, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(415);
    expect((await request(app).get('/api/textures')).body).toEqual([]);
    expect(await fs.readdir(sandbox.store.BLOBS_DIR)).toEqual([]);
  });

  it('strips directories from the filename and caps its length', async () => {
    const res = await request(app)
      .post('/api/textures')
      .attach('file', PNG_BYTES, { filename: `../../${'a'.repeat(300)}.png` });
    expect(res.status).toBe(201);
    expect(res.body.filename).not.toContain('/');
    expect(res.body.filename.length).toBeLessThanOrEqual(200);
  });

  it('keeps a UTF-8 filename intact instead of decoding it as latin1', async () => {
    const res = await uploadPng('pared_año.jpg');
    expect(res.status).toBe(201);
    expect(res.body.filename).toBe('pared_año.jpg');
    const list = await request(app).get('/api/textures');
    expect(list.body[0].filename).toBe('pared_año.jpg');
  });

  it('rejects a request without a file', async () => {
    const res = await request(app).post('/api/textures').field('note', 'hi');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'missing file' });
  });

  it('rejects a non-multipart body', async () => {
    const res = await request(app).post('/api/textures').send({ file: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects an unexpected field name with a 400', async () => {
    const res = await request(app).post('/api/textures').attach('image', PNG_BYTES, 'a.png');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid upload' });
  });

  it('rejects a second file with a 400', async () => {
    const res = await request(app)
      .post('/api/textures')
      .attach('file', PNG_BYTES, 'a.png')
      .attach('file', PNG_BYTES, 'b.png');
    expect(res.status).toBe(400);
  });

  it('rejects a file over 25 MB with a 413 and stores nothing', async () => {
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(25 * 1024 * 1024)]);
    const res = await request(app).post('/api/textures').attach('file', big, 'big.png');
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'file too large' });
    expect((await request(app).get('/api/textures')).body).toEqual([]);
    expect(await fs.readdir(sandbox.store.BLOBS_DIR)).toEqual([]);
  });

  it('removes the blob when the manifest update fails', async () => {
    // Only the manifest rename fails: the blob write must succeed first so
    // the upload reaches the cleanup path.
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(to).endsWith('manifest.json')) throw new Error('boom');
      return rename(from, to);
    });

    const res = await uploadPng();
    expect(res.status).toBe(500);
    expect(await fs.readdir(sandbox.store.BLOBS_DIR)).toEqual([]);
  });
});

describe('texture ids', () => {
  const traversal = [
    '..',
    '..%2F..%2Fscene.json',
    '..%5C..%5Cscene.json',
    '%2e%2e%2fscene.json',
    'not-a-uuid',
    '3b241101e2bb42558caf4136c566a962',
  ];

  it.each(traversal)('GET rejects the id %s with a 400', async (id) => {
    const res = await request(app).get(`/api/textures/${id}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid texture id' });
  });

  it.each(traversal)('PATCH rejects the id %s with a 400', async (id) => {
    const res = await request(app).patch(`/api/textures/${id}`).send({ scale: 2 });
    expect(res.status).toBe(400);
  });

  it.each(traversal)('DELETE rejects the id %s with a 400', async (id) => {
    const res = await request(app).delete(`/api/textures/${id}`);
    expect(res.status).toBe(400);
  });

  it('keeps the data directory intact after a traversal attempt', async () => {
    await request(app).put('/api/scene').send(sampleScene());
    await request(app).delete('/api/textures/..%2F..%2Fscene.json');
    expect((await request(app).get('/api/scene')).body.hour).toBe(9.5);
  });
});

describe('texture download', () => {
  it('serves the bytes with hardened headers', async () => {
    const { body } = await uploadPng();
    const res = await request(app).get(`/api/textures/${body.id}`).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(PNG_BYTES);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('answers 404 for an unknown id', async () => {
    expect((await request(app).get(`/api/textures/${UNKNOWN_ID}`)).status).toBe(404);
  });

  it('answers 404 when the manifest entry has no blob', async () => {
    const { body } = await uploadPng();
    await fs.unlink(sandbox.store.blobPath(body.id));
    expect((await request(app).get(`/api/textures/${body.id}`)).status).toBe(404);
  });

  it('serves an entry with a non-allow-listed type as an opaque download', async () => {
    await sandbox.store.writeBlob(UNKNOWN_ID, Buffer.from('<svg/>'));
    await sandbox.store.updateManifest((current) => ({
      ...current,
      textures: [
        { id: UNKNOWN_ID, filename: 'x.svg', scale: 1, createdAt: 1, mimeType: 'image/svg+xml' },
      ],
    }));
    const res = await request(app).get(`/api/textures/${UNKNOWN_ID}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('texture scale patch', () => {
  it('updates the scale and persists it', async () => {
    const { body } = await uploadPng();
    const res = await request(app).patch(`/api/textures/${body.id}`).send({ scale: 2.5 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: body.id, scale: 2.5 });
    expect((await request(app).get('/api/textures')).body[0].scale).toBe(2.5);
  });

  it.each([0, -1, 0.001, 101, '2', null])('rejects the scale %j with a 400', async (scale) => {
    const { body } = await uploadPng();
    const res = await request(app).patch(`/api/textures/${body.id}`).send({ scale });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scale must be a finite number/);
  });

  it('rejects a request without a body', async () => {
    const { body } = await uploadPng();
    const res = await request(app).patch(`/api/textures/${body.id}`);
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON', async () => {
    const { body } = await uploadPng();
    const res = await request(app)
      .patch(`/api/textures/${body.id}`)
      .set('Content-Type', 'application/json')
      .send('{scale:');
    expect(res.status).toBe(400);
  });

  it('answers 404 for an unknown id', async () => {
    const res = await request(app).patch(`/api/textures/${UNKNOWN_ID}`).send({ scale: 2 });
    expect(res.status).toBe(404);
  });

  it('does not write the manifest for an unknown id', async () => {
    await sandbox.store.ensureDirs();
    const res = await request(app).patch(`/api/textures/${UNKNOWN_ID}`).send({ scale: 2 });
    expect(res.status).toBe(404);
    await expect(fs.access(sandbox.store.MANIFEST_PATH)).rejects.toThrow();
  });

  it('keeps every scale update and upload when they are issued concurrently', async () => {
    const first = (await uploadPng('a.png')).body;
    const scales = [2, 3, 4, 5, 6];
    const [, ...patches] = await Promise.all([
      uploadPng('b.png'),
      ...scales.map((scale) => request(app).patch(`/api/textures/${first.id}`).send({ scale })),
    ]);
    expect(patches.every((p) => p.status === 200)).toBe(true);

    const list = (await request(app).get('/api/textures')).body as { id: string; scale: number }[];
    expect(list).toHaveLength(2);
    expect(list.find((t) => t.id === first.id)?.scale).toBeGreaterThanOrEqual(2);
    // The queue preserves submission order, so the manifest on disk matches
    // the in-memory view and no update was lost to a stale read.
    const onDisk = JSON.parse(await fs.readFile(sandbox.store.MANIFEST_PATH, 'utf8'));
    expect(onDisk.textures).toEqual(list);
  });

  it('only touches the targeted texture', async () => {
    const first = (await uploadPng('a.png')).body;
    const second = (await uploadPng('b.png')).body;
    await request(app).patch(`/api/textures/${second.id}`).send({ scale: 4 });
    const list = (await request(app).get('/api/textures')).body;
    expect(list.find((t: { id: string }) => t.id === first.id).scale).toBe(1);
  });
});

describe('texture delete', () => {
  it('removes the record and the blob', async () => {
    const { body } = await uploadPng();
    const res = await request(app).delete(`/api/textures/${body.id}`);
    expect(res.status).toBe(204);
    expect((await request(app).get('/api/textures')).body).toEqual([]);
    await expect(fs.access(sandbox.store.blobPath(body.id))).rejects.toThrow();
    expect((await request(app).get(`/api/textures/${body.id}`)).status).toBe(404);
  });

  it('is idempotent for an unknown id', async () => {
    expect((await request(app).delete(`/api/textures/${UNKNOWN_ID}`)).status).toBe(204);
  });
});

describe('security', () => {
  it('hides the framework and sets baseline headers on every response', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('answers unknown API paths with JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
    const post = await request(app).post('/api/nope').send({});
    expect(post.status).toBe(404);
    expect(post.body).toEqual({ error: 'not found' });
  });

  it.each(['evil.example', 'evil.example:3001', '192.168.1.50:3001'])(
    'rejects the Host %s',
    async (host) => {
      const res = await request(app).get('/api/health').set('Host', host);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'forbidden host' });
    },
  );

  it.each(['localhost:3001', '127.0.0.1:5173', '[::1]:3001'])('accepts the Host %s', async (host) => {
    expect((await request(app).get('/api/health').set('Host', host)).status).toBe(200);
  });

  it('accepts a Host listed in ALLOWED_HOSTS', async () => {
    vi.stubEnv('ALLOWED_HOSTS', 'nas.lan, 192.168.1.50');
    const lan = sandbox.appModule.createApp({ distDir: path.join(sandbox.dataDir, 'no-dist') });
    expect((await request(lan).get('/api/health').set('Host', '192.168.1.50:3001')).status).toBe(200);
    expect((await request(lan).get('/api/health').set('Host', 'nas.lan')).status).toBe(200);
  });

  it('accepts ALLOWED_HOSTS entries written with a port, in upper case, or as IPv6', async () => {
    vi.stubEnv('ALLOWED_HOSTS', 'NAS.lan:3001, 10.0.0.5:8080, [fd00::1]:3001, fd00::2');
    const lan = sandbox.appModule.createApp({ distDir: path.join(sandbox.dataDir, 'no-dist') });
    for (const host of ['nas.lan:3001', '10.0.0.5', '[fd00::1]:3001', '[fd00::2]:3001']) {
      expect((await request(lan).get('/api/health').set('Host', host)).status).toBe(200);
    }
    expect((await request(lan).get('/api/health').set('Host', 'other.lan')).status).toBe(403);
  });

  it('compares the Origin with the Host header case-insensitively', async () => {
    vi.stubEnv('ALLOWED_HOSTS', 'nas.lan');
    const lan = sandbox.appModule.createApp({ distDir: path.join(sandbox.dataDir, 'no-dist') });
    const res = await request(lan)
      .delete(`/api/textures/${UNKNOWN_ID}`)
      .set('Host', 'NAS.lan:3001')
      .set('Origin', 'http://nas.lan:3001');
    expect(res.status).not.toBe(403);
  });

  it('rejects a cross-origin state-changing request and stores nothing', async () => {
    const res = await request(app)
      .put('/api/scene')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://evil.example')
      .send(sampleScene());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden origin' });
    expect((await request(app).get('/api/scene')).body.hour).toBe(12);
  });

  it.each(['null', 'not a url', 'http://localhost:5173'])(
    'rejects a state-changing request with the Origin %s',
    async (origin) => {
      const res = await request(app)
        .delete(`/api/textures/${UNKNOWN_ID}`)
        .set('Host', 'localhost:3001')
        .set('Origin', origin);
      expect(res.status).toBe(403);
    },
  );

  it('accepts a same-origin state-changing request', async () => {
    const res = await request(app)
      .put('/api/scene')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://localhost:3001')
      .send(sampleScene());
    expect(res.status).toBe(204);
  });

  it('accepts state-changing requests that carry no Origin', async () => {
    expect((await request(app).put('/api/scene').send(sampleScene())).status).toBe(204);
  });

  it('does not apply the Origin check to reads', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://evil.example');
    expect(res.status).toBe(200);
  });
});

describe('static serving', () => {
  it('serves the SPA shell for client routes but 404s unknown API paths', async () => {
    const distDir = await makeTempDir('walkthrough-dist');
    await fs.writeFile(path.join(distDir, 'index.html'), '<html>shell</html>');
    await fs.writeFile(path.join(distDir, 'app.js'), 'console.log(1)');
    const spa = sandbox.appModule.createApp({ distDir });

    const root = await request(spa).get('/');
    expect(root.status).toBe(200);
    expect(root.text).toBe('<html>shell</html>');
    expect((await request(spa).get('/walkthrough')).text).toBe('<html>shell</html>');
    expect((await request(spa).get('/app.js')).status).toBe(200);
    expect((await request(spa).get('/api/nope')).status).toBe(404);
    // A missing asset is a real 404, not the HTML shell.
    const asset = await request(spa).get('/assets/missing-abc123.js');
    expect(asset.status).toBe(404);
    expect(asset.text).not.toContain('shell');
    expect((await request(spa).get('/api/health')).body).toEqual({ ok: true });
    await fs.rm(distDir, { recursive: true, force: true });
  });

  it('is API-only when the build folder is missing', async () => {
    expect((await request(app).get('/')).status).toBe(404);
  });

  it('serves private models read-only under /models/', async () => {
    const base = await makeTempDir('walkthrough-models');
    const modelsDir = path.join(base, 'models');
    await fs.mkdir(modelsDir);
    await fs.writeFile(path.join(modelsDir, 'House.fbx'), 'fbx-bytes');
    await fs.writeFile(path.join(base, 'secret.txt'), 'secret');
    const distDir = path.join(base, 'dist');
    await fs.mkdir(distDir);
    await fs.writeFile(path.join(distDir, 'index.html'), '<html>shell</html>');
    const withModels = sandbox.appModule.createApp({ distDir, modelsDir });

    const ok = await request(withModels).get('/models/House.fbx').buffer(true).parse(binary);
    expect(ok.status).toBe(200);
    expect(ok.body.toString()).toBe('fbx-bytes');

    const missing = await request(withModels).get('/models/Other.fbx');
    expect(missing.status).toBe(404);
    expect(missing.text).not.toContain('shell');

    const escape = await request(withModels).get('/models/..%2Fsecret.txt');
    expect(escape.status).not.toBe(200);
    expect(escape.text).not.toContain('secret');

    expect((await request(withModels).post('/models/House.fbx')).status).toBe(404);
    await fs.rm(base, { recursive: true, force: true });
  });

  it('serves /models/ from the MODELS_DIR environment variable', async () => {
    const modelsDir = await makeTempDir('walkthrough-models-env');
    await fs.writeFile(path.join(modelsDir, 'House.fbx'), 'fbx-bytes');
    vi.stubEnv('MODELS_DIR', modelsDir);
    const fromEnv = sandbox.appModule.createApp({ distDir: path.join(sandbox.dataDir, 'no-dist') });

    const ok = await request(fromEnv).get('/models/House.fbx').buffer(true).parse(binary);
    expect(ok.status).toBe(200);
    expect(ok.body.toString()).toBe('fbx-bytes');
    expect((await request(fromEnv).get('/models/Other.fbx')).status).toBe(404);
    await fs.rm(modelsDir, { recursive: true, force: true });
  });

  it.each(['/models', '/models/', '/models/House.fbx'])(
    'answers a plain 404 for %s when no models folder is set',
    async (url) => {
      vi.stubEnv('MODELS_DIR', '');
      const distDir = await makeTempDir('walkthrough-dist');
      await fs.writeFile(path.join(distDir, 'index.html'), '<html>shell</html>');
      const noModels = sandbox.appModule.createApp({ distDir });
      const res = await request(noModels).get(url);
      expect(res.status).toBe(404);
      expect(res.text).toBe('');
      await fs.rm(distDir, { recursive: true, force: true });
    },
  );

  it('does not expose /models/ when no folder is configured', async () => {
    const distDir = await makeTempDir('walkthrough-dist');
    await fs.writeFile(path.join(distDir, 'index.html'), '<html>shell</html>');
    const noModels = sandbox.appModule.createApp({ distDir, modelsDir: path.join(distDir, 'missing') });
    const res = await request(noModels).get('/models/House.fbx');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('shell');
    await fs.rm(distDir, { recursive: true, force: true });
  });
});

// Loads the demo scene into an API: the textures through the upload endpoint
// and the scene document through the save endpoint, the same two doors the
// editor uses. The content is `demo/seed.json`, which names the bodies and
// triangles of the bundled demo house (`public/demo/house.glb`).
//
// As a command it seeds a running API and refuses to touch one that already
// holds a scene or textures, so a development server with real work in it is
// never overwritten by accident:
//
//   SHOWCASE_API=http://127.0.0.1:3001/api node showcase/seed.mjs
//   SHOWCASE_API=... node showcase/seed.mjs --force     seed anyway: replaces the scene, adds the textures
//
// The capture script imports `seedDemo` and runs it against its own throwaway
// API, where there is nothing to protect.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..');
const DEMO_DIR = path.join(here, 'demo');

/** Reads the versioned seed definition. */
export const loadSeed = async () => JSON.parse(await readFile(path.join(DEMO_DIR, 'seed.json'), 'utf8'));

/**
 * Checks the seed against the real model: every body exists, and every seed
 * triangle exists in its body's geometry. A model rebuilt with different
 * names or piece counts makes the seed fail here instead of painting nothing.
 */
export const validateSeed = async seed => {
  const document = await new NodeIO().read(path.join(REPO, seed.house));
  const triangles = new Map();
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    let count = 0;
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      count += (indices ?? primitive.getAttribute('POSITION')).getCount() / 3;
    }
    triangles.set(node.getName(), count);
  }

  const problems = [];
  const textureKeys = new Set(seed.textures.map(texture => texture.key));
  const checkTexture = key => textureKeys.has(key) || problems.push(`unknown texture "${key}"`);

  for (const group of seed.scene.bodies) {
    checkTexture(group.texture);
    for (const name of group.names) triangles.has(name) || problems.push(`body "${name}" is not in the house`);
  }
  for (const group of seed.scene.faces) {
    checkTexture(group.texture);
    for (const { body, tri } of group.seeds) {
      if (!triangles.has(body)) problems.push(`face body "${body}" is not in the house`);
      else if (tri >= triangles.get(body)) problems.push(`triangle ${tri} is outside "${body}" (${triangles.get(body)} triangles)`);
    }
  }

  if (problems.length > 0) throw new Error(`demo/seed.json does not match ${seed.house}:\n  ${problems.join('\n  ')}`);
};

const request = async (api, route, init, expected) => {
  const response = await fetch(`${api}${route}`, init);
  if (!expected.includes(response.status)) {
    throw new Error(`${init?.method ?? 'GET'} ${route} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return response;
};

/** Uploads the textures and returns a map from seed key to the server's id. */
const uploadTextures = async (api, seed) => {
  const ids = new Map();
  for (const texture of seed.textures) {
    const bytes = await readFile(path.join(DEMO_DIR, texture.file));
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'image/jpeg' }), texture.name);
    const created = await (await request(api, '/textures', { method: 'POST', body: form }, [201])).json();
    await request(
      api,
      `/textures/${created.id}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scale: texture.scale }) },
      [200]
    );
    ids.set(texture.key, created.id);
  }
  return ids;
};

/** Turns the seed's grouped entries into the scene document the API stores. */
export const buildScene = (seed, ids, { skipBodies = [], hour } = {}) => {
  const skip = new Set(skipBodies);
  const bodies = seed.scene.bodies.flatMap(group =>
    group.names.filter(name => !skip.has(name)).map(bodyName => ({ bodyName, textureId: ids.get(group.texture) }))
  );
  const faces = seed.scene.faces.flatMap(group =>
    group.seeds
      .filter(({ body }) => !skip.has(body))
      .map(({ body, tri }) => ({ bodyName: body, seedTriIndex: tri, normalToleranceDeg: group.toleranceDeg, textureId: ids.get(group.texture) }))
  );
  return { bodies, faces, lights: seed.scene.lights, hour: hour ?? seed.scene.hour };
};

/**
 * Loads the demo into the API: the textures, then the scene.
 *
 * @param {string} api The API root, for example `http://127.0.0.1:3917/api`.
 * @param {{ skipBodies?: string[], hour?: number }} [options] Bodies left unpainted, so a flow can paint them itself, and the hour of day to start at.
 * @returns {Promise<{ ids: Map<string, string>, textureNames: string[] }>}
 */
export const seedDemo = async (api, options = {}) => {
  const seed = await loadSeed();
  await validateSeed(seed);
  const ids = await uploadTextures(api, seed);
  await putScene(api, buildScene(seed, ids, options));
  return { ids, textureNames: seed.textures.map(texture => texture.name) };
};

/** Replaces the stored scene document. */
export const putScene = async (api, scene) => {
  await request(api, '/scene', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scene) }, [204]);
};

/** Rewrites the scene of an API that already holds the seed's textures. */
export const reseedScene = async (api, ids, options = {}) => {
  const seed = await loadSeed();
  await putScene(api, buildScene(seed, ids, options));
};

const main = async () => {
  const api = process.env.SHOWCASE_API?.replace(/\/$/, '');
  if (!api) throw new Error('Set SHOWCASE_API to the API root to seed, for example http://127.0.0.1:3001/api');

  if (!process.argv.includes('--force')) {
    const scene = await (await request(api, '/scene', undefined, [200])).json();
    const textures = await (await request(api, '/textures', undefined, [200])).json();
    const empty = scene.bodies.length === 0 && scene.faces.length === 0 && scene.lights.length === 0 && textures.length === 0;
    if (!empty) throw new Error(`${api} already holds a scene or textures. Seeding would replace the scene and add to the textures; pass --force if that is intended.`);
  }

  const { textureNames } = await seedDemo(api);
  console.log(`OK   seeded ${textureNames.length} textures and the demo scene into ${api}`);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(`FAIL ${error.message}`);
    process.exit(1);
  });
}

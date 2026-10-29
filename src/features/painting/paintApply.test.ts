import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Texture } from './types';

const getTexture = vi.fn<(id: string, url: string) => Promise<THREE.Texture>>();
vi.mock('./textureCache', () => ({ getTexture: (id: string, url: string) => getTexture(id, url) }));

const { applyBodyPaints, applyFacePaints, disposePaintResources } = await import('./paintApply');
const { isTriplanarMaterial, getTriplanarTextureId } = await import('./triplanarMaterial');
const { listFaces } = await import('./faceManager');

const textures: Texture[] = [
  { id: 't1', filename: 'one.png', url: '/one', scale: 1 },
  { id: 't2', filename: 'two.png', url: '/two', scale: 2 },
];

function makeHouse(): { root: THREE.Group; wall: THREE.Mesh } {
  const root = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  wall.name = 'wall';
  root.add(wall);
  return { root, wall };
}

/** A texture request the test resolves by hand. */
function pendingTexture() {
  let resolve!: (texture: THREE.Texture) => void;
  const promise = new Promise<THREE.Texture>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  getTexture.mockReset();
});

describe('applyBodyPaints', () => {
  it('paints a body with a triplanar material and restores it when the paint goes', async () => {
    getTexture.mockResolvedValue(new THREE.Texture());
    const { root, wall } = makeHouse();
    const original = wall.material;

    await applyBodyPaints(root, [{ bodyName: 'wall', textureId: 't1' }], textures);
    expect(isTriplanarMaterial(wall.material as THREE.Material)).toBe(true);

    const painted = wall.material as THREE.Material;
    let disposed = false;
    painted.addEventListener('dispose', () => (disposed = true));
    await applyBodyPaints(root, [], textures);
    expect(wall.material).toBe(original);
    expect(disposed).toBe(true);
  });

  it('never runs two reconciles at once and applies only the newest request', async () => {
    const first = pendingTexture();
    getTexture.mockImplementation((id) =>
      id === 't1' ? first.promise : Promise.resolve(new THREE.Texture()),
    );
    const { root, wall } = makeHouse();

    const a = applyBodyPaints(root, [{ bodyName: 'wall', textureId: 't1' }], textures);
    const b = applyBodyPaints(root, [{ bodyName: 'wall', textureId: 't2' }], textures);

    // The second request waits: only the first one asked for a texture.
    expect(getTexture).toHaveBeenCalledTimes(1);
    expect(getTexture).toHaveBeenCalledWith('t1', '/one');

    first.resolve(new THREE.Texture());
    await Promise.all([a, b]);

    // The superseded run created nothing; the newest paint is what shows.
    expect(getTriplanarTextureId(wall.material as THREE.Material)).toBe('t2');
  });

  it('keeps a failed texture load from aborting the reconcile', async () => {
    getTexture.mockRejectedValue(new Error('404'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { root, wall } = makeHouse();
    const original = wall.material;

    await applyBodyPaints(root, [{ bodyName: 'wall', textureId: 't1' }], textures);
    expect(wall.material).toBe(original);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('keeps separate schedulers for separate roots', async () => {
    getTexture.mockResolvedValue(new THREE.Texture());
    const one = makeHouse();
    const two = makeHouse();
    await Promise.all([
      applyBodyPaints(one.root, [{ bodyName: 'wall', textureId: 't1' }], textures),
      applyBodyPaints(two.root, [{ bodyName: 'wall', textureId: 't2' }], textures),
    ]);
    expect(getTriplanarTextureId(one.wall.material as THREE.Material)).toBe('t1');
    expect(getTriplanarTextureId(two.wall.material as THREE.Material)).toBe('t2');
  });
});

describe('disposePaintResources', () => {
  it('disposes face and body paint materials and restores the original', async () => {
    getTexture.mockResolvedValue(new THREE.Texture());
    const { root, wall } = makeHouse();
    const original = wall.material;
    await applyBodyPaints(root, [{ bodyName: 'wall', textureId: 't1' }], textures);
    await applyFacePaints(
      root,
      [{ bodyName: 'wall', seedTriIndex: 0, normalToleranceDeg: 5, textureId: 't1' }],
      textures,
    );

    const disposed: string[] = [];
    (wall.material as THREE.Material).addEventListener('dispose', () => disposed.push('body'));
    (listFaces(wall)[0].mesh.material as THREE.Material).addEventListener('dispose', () =>
      disposed.push('face'),
    );

    disposePaintResources(root);

    expect(disposed.sort()).toEqual(['body', 'face']);
    expect(wall.material).toBe(original);
    expect(wall.children).toHaveLength(0);
  });
});

describe('applyFacePaints', () => {
  it('creates one face per seed even when called repeatedly', async () => {
    const gate = pendingTexture();
    getTexture.mockReturnValue(gate.promise);
    const { root, wall } = makeHouse();
    const paints = [
      { bodyName: 'wall', seedTriIndex: 0, normalToleranceDeg: 5, textureId: 't1' },
    ];

    const calls = [
      applyFacePaints(root, paints, textures),
      applyFacePaints(root, paints, textures),
      applyFacePaints(root, paints, textures),
    ];
    gate.resolve(new THREE.Texture());
    await Promise.all(calls);

    expect(listFaces(wall)).toHaveLength(1);
    expect(wall.children).toHaveLength(1);
  });

  it('removes faces whose paint is gone', async () => {
    getTexture.mockResolvedValue(new THREE.Texture());
    const { root, wall } = makeHouse();
    const paints = [
      { bodyName: 'wall', seedTriIndex: 0, normalToleranceDeg: 5, textureId: 't1' },
    ];
    await applyFacePaints(root, paints, textures);
    expect(listFaces(wall)).toHaveLength(1);

    await applyFacePaints(root, [], textures);
    expect(listFaces(wall)).toHaveLength(0);
    expect(wall.children).toHaveLength(0);
  });
});

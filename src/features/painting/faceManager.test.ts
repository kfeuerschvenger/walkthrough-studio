import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  addOrUpdateFace,
  currentTriToOriginal,
  listFaces,
  removeAllFaces,
  removeFace,
} from './faceManager';
import { floodFillFace } from './floodFill';

/** Two triangles per face of a box: 12 triangles, indexed. */
function makeParent(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
}

/** Triangles the mesh draws: the index length clipped by the draw range. */
const drawnIndexCount = (mesh: THREE.Mesh) => {
  const total = mesh.geometry.getIndex()?.count ?? 0;
  const { start, count } = mesh.geometry.drawRange;
  return Math.max(0, Math.min(total, start + count) - start);
};
const triCount = (mesh: THREE.Mesh) => drawnIndexCount(mesh) / 3;
const material = () => new THREE.MeshStandardMaterial();

describe('faceManager', () => {
  it('moves the painted triangles to a child and removes them from the parent', () => {
    const parent = makeParent();
    expect(triCount(parent)).toBe(12);

    const face = addOrUpdateFace(parent, 'body', 0, [0, 1], material());

    expect(triCount(parent)).toBe(10);
    expect(face.parent).toBe(parent);
    expect(triCount(face)).toBe(2);
    expect(listFaces(parent)).toHaveLength(1);
  });

  it('maps current triangle indices back to the original ones', () => {
    const parent = makeParent();
    addOrUpdateFace(parent, 'body', 0, [0, 1], material());

    // Originals 0 and 1 are gone, so current 0 is original 2.
    expect(currentTriToOriginal(parent, 0)).toBe(2);
    expect(currentTriToOriginal(parent, 9)).toBe(11);
  });

  it('is the identity mapping while nothing is painted', () => {
    const parent = makeParent();
    expect(currentTriToOriginal(parent, 5)).toBe(5);
  });

  it('keeps the mapping correct across several faces', () => {
    const parent = makeParent();
    addOrUpdateFace(parent, 'body', 0, [0, 1], material());
    addOrUpdateFace(parent, 'body', 4, [4, 5], material());

    expect(triCount(parent)).toBe(8);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => currentTriToOriginal(parent, i))).toEqual([
      2, 3, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('swaps the material in place when the seed already exists', () => {
    const parent = makeParent();
    const first = material();
    const face = addOrUpdateFace(parent, 'body', 0, [0, 1], first);
    let disposed = false;
    first.addEventListener('dispose', () => (disposed = true));

    const second = material();
    const same = addOrUpdateFace(parent, 'body', 0, [0, 1], second);

    expect(same).toBe(face);
    expect(face.material).toBe(second);
    expect(disposed).toBe(true);
    expect(listFaces(parent)).toHaveLength(1);
    expect(triCount(parent)).toBe(10);
  });

  it('does not replace the parent index attribute when faces change', () => {
    const parent = makeParent();
    const index = parent.geometry.getIndex();
    addOrUpdateFace(parent, 'body', 0, [0, 1], material());
    addOrUpdateFace(parent, 'body', 4, [4, 5], material());
    removeFace(parent, 0);
    removeAllFaces(parent);

    expect(parent.geometry.getIndex()).toBe(index);
    expect(triCount(parent)).toBe(12);
  });

  it('keeps the previous material when the same instance is passed again', () => {
    const parent = makeParent();
    const shared = material();
    addOrUpdateFace(parent, 'body', 0, [0, 1], shared);
    let disposed = false;
    shared.addEventListener('dispose', () => (disposed = true));

    addOrUpdateFace(parent, 'body', 0, [0, 1], shared);
    expect(disposed).toBe(false);
  });

  it('restores the triangles when a face is removed', () => {
    const parent = makeParent();
    addOrUpdateFace(parent, 'body', 0, [0, 1], material());
    removeFace(parent, 0);

    expect(triCount(parent)).toBe(12);
    expect(listFaces(parent)).toHaveLength(0);
    expect(parent.children).toHaveLength(0);
  });

  it('ignores removal of an unknown seed', () => {
    const parent = makeParent();
    addOrUpdateFace(parent, 'body', 0, [0, 1], material());
    removeFace(parent, 99);
    expect(listFaces(parent)).toHaveLength(1);
  });

  it('removes every face in one pass', () => {
    const parent = makeParent();
    addOrUpdateFace(parent, 'body', 0, [0, 1], material());
    addOrUpdateFace(parent, 'body', 4, [4, 5], material());
    removeAllFaces(parent);

    expect(triCount(parent)).toBe(12);
    expect(parent.children).toHaveLength(0);
  });

  it('disposes the face geometry on removal and keeps the parent attributes', () => {
    const parent = makeParent();
    const face = addOrUpdateFace(parent, 'body', 0, [0, 1], material());
    let disposed = 0;
    face.geometry.addEventListener('dispose', () => disposed++);
    const position = parent.geometry.getAttribute('position');

    removeFace(parent, 0);

    expect(disposed).toBe(1);
    expect(parent.geometry.getAttribute('position')).toBe(position);
  });

  it('disposes every face geometry when all faces are removed', () => {
    const parent = makeParent();
    const faces = [
      addOrUpdateFace(parent, 'body', 0, [0, 1], material()),
      addOrUpdateFace(parent, 'body', 4, [4, 5], material()),
    ];
    let disposed = 0;
    for (const face of faces) face.geometry.addEventListener('dispose', () => disposed++);

    removeAllFaces(parent);

    expect(disposed).toBe(2);
  });

  describe('multi-material bodies', () => {
    /** A box draws each of its six faces (two triangles) from its own group. */
    function makeMultiMaterialParent(): THREE.Mesh {
      return new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        Array.from({ length: 6 }, () => new THREE.MeshStandardMaterial()),
      );
    }

    const groups = (mesh: THREE.Mesh) =>
      mesh.geometry.groups.map(({ start, count, materialIndex }) => ({ start, count, materialIndex }));

    it('shifts the groups after the removed triangles', () => {
      const parent = makeMultiMaterialParent();
      // Triangles 0 and 1 are the whole of group 0.
      addOrUpdateFace(parent, 'body', 0, [0, 1], material());

      expect(groups(parent)).toEqual([
        { start: 0, count: 6, materialIndex: 1 },
        { start: 6, count: 6, materialIndex: 2 },
        { start: 12, count: 6, materialIndex: 3 },
        { start: 18, count: 6, materialIndex: 4 },
        { start: 24, count: 6, materialIndex: 5 },
      ]);
    });

    it('shrinks a group that loses only some of its triangles', () => {
      const parent = makeMultiMaterialParent();
      addOrUpdateFace(parent, 'body', 2, [2], material());

      expect(groups(parent)).toEqual([
        { start: 0, count: 6, materialIndex: 0 },
        { start: 6, count: 3, materialIndex: 1 },
        { start: 9, count: 6, materialIndex: 2 },
        { start: 15, count: 6, materialIndex: 3 },
        { start: 21, count: 6, materialIndex: 4 },
        { start: 27, count: 6, materialIndex: 5 },
      ]);
      expect(triCount(parent)).toBe(11);
    });

    it('covers exactly the remaining index range', () => {
      const parent = makeMultiMaterialParent();
      addOrUpdateFace(parent, 'body', 0, [0, 1], material());
      addOrUpdateFace(parent, 'body', 5, [5], material());

      const covered = parent.geometry.groups.reduce((sum, group) => sum + group.count, 0);
      expect(covered).toBe(drawnIndexCount(parent));
    });

    it('restores the original groups once every face is removed', () => {
      const parent = makeMultiMaterialParent();
      const before = groups(parent);
      addOrUpdateFace(parent, 'body', 0, [0, 1], material());
      removeAllFaces(parent);
      expect(groups(parent)).toEqual(before);
    });
  });

  it('floods in original triangle space once another face is painted on the body', () => {
    // Triangles 0 and 1 are isolated patches, 2 and 3 are a floor quad, 4 is a
    // wall sharing an edge with 3 at a right angle.
    const triangles = [
      [10, 0, 0, 10, 0, 1, 11, 0, 0],
      [20, 0, 0, 20, 0, 1, 21, 0, 0],
      [0, 0, 0, 0, 0, 1, 1, 0, 0],
      [1, 0, 0, 0, 0, 1, 1, 0, 1],
      [0, 0, 1, 1, 0, 1, 0, 1, 1],
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(triangles.flat()), 3),
    );
    const parent = new THREE.Mesh(geometry, material());

    addOrUpdateFace(parent, 'body', 0, [0, 1], material());

    expect(floodFillFace(geometry, 2, 5).sort()).toEqual([2, 3]);
  });

  it('tags the child so painting resolves back to the body', () => {
    const parent = makeParent();
    const face = addOrUpdateFace(parent, 'wall', 3, [3], material());
    expect(face.userData).toMatchObject({ isFace: true, bodyName: 'wall', seedTriIndex: 3 });
  });
});

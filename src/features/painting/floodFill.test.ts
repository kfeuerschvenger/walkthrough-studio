import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAdjacency, edgeKey, ensureIndexed, floodFillFace } from './floodFill';

describe('edgeKey', () => {
  it('is the same for both directions of an edge', () => {
    expect(edgeKey(3, 7, 10)).toBe(edgeKey(7, 3, 10));
  });

  it('is unique per pair of ids', () => {
    const keys = new Set<number>();
    for (let a = 0; a < 20; a++) {
      for (let b = a; b < 20; b++) keys.add(edgeKey(a, b, 20));
    }
    expect(keys.size).toBe(210);
  });
});

type Tri = [[number, number, number], [number, number, number], [number, number, number]];

/** Builds a non-indexed triangle soup, the layout FBX exports tend to have. */
function soup(triangles: Tri[]): THREE.BufferGeometry {
  const positions = new Float32Array(triangles.length * 9);
  triangles.forEach((tri, t) => {
    tri.forEach((vertex, v) => positions.set(vertex, t * 9 + v * 3));
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

/** A 2x2 grid of quads on the XZ plane (8 triangles, normals +Y). */
function floorTriangles(): Tri[] {
  const tris: Tri[] = [];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      tris.push([[i, 0, j], [i, 0, j + 1], [i + 1, 0, j]]);
      tris.push([[i + 1, 0, j], [i, 0, j + 1], [i + 1, 0, j + 1]]);
    }
  }
  return tris;
}

/** A unit wall on the XY plane (2 triangles, normals +Z) sharing an edge with the floor. */
function wallTriangles(): Tri[] {
  return [
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
    [[1, 0, 0], [1, 1, 0], [0, 1, 0]],
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ensureIndexed', () => {
  it('synthesizes an identity index for a triangle soup', () => {
    const geometry = soup(floorTriangles());
    const index = ensureIndexed(geometry);
    expect(index.count).toBe(24);
    expect(Array.from(index.array)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    expect(geometry.getIndex()).toBe(index);
  });

  it('returns the existing index untouched', () => {
    const geometry = soup(floorTriangles());
    const first = ensureIndexed(geometry);
    expect(ensureIndexed(geometry)).toBe(first);
  });

  it('uses a 32-bit index for large geometries', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(65538 * 3), 3));
    expect(ensureIndexed(geometry).array).toBeInstanceOf(Uint32Array);
  });

  it('rejects a vertex count that is not a multiple of three', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
    expect(() => ensureIndexed(geometry)).toThrow(/not divisible by 3/);
  });
});

describe('buildAdjacency', () => {
  it('links triangles that share an edge even when their vertices are duplicated', () => {
    const geometry = soup(floorTriangles());
    const adjacency = buildAdjacency(geometry);
    expect(adjacency).toHaveLength(8);
    // Triangle 0 and 1 form the first quad and share its diagonal.
    expect(adjacency[0]).toContain(1);
    expect(adjacency[1]).toContain(0);
    // Triangle 0 never touches the opposite corner quad (triangles 6 and 7).
    expect(adjacency[0]).not.toContain(7);
  });

  it('caches the result on the geometry', () => {
    const geometry = soup(floorTriangles());
    expect(buildAdjacency(geometry)).toBe(buildAdjacency(geometry));
  });

  it('merges vertices that round to the same position', () => {
    const geometry = soup([
      [[0, 0, 0], [0, 0, 1], [1, 0, 0]],
      // Shares the (0,0,1)-(1,0,0) edge, offset by far less than 0.1 mm.
      [[1.00001, 0, 0], [0, 0, 1.00001], [1, 0, 1]],
    ]);
    const adjacency = buildAdjacency(geometry);
    expect(adjacency[0]).toEqual([1]);
    expect(adjacency[1]).toEqual([0]);
  });
});

describe('floodFillFace', () => {
  it('selects every coplanar triangle from a seed on a flat surface', () => {
    const geometry = soup([...floorTriangles(), ...wallTriangles()]);
    const face = floodFillFace(geometry, 0, 10);
    expect(face.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('stops at an edge sharper than the tolerance', () => {
    const geometry = soup([...floorTriangles(), ...wallTriangles()]);
    const wall = floodFillFace(geometry, 8, 10);
    expect(wall.sort((a, b) => a - b)).toEqual([8, 9]);
  });

  it('crosses the edge once the tolerance covers the angle', () => {
    const geometry = soup([...floorTriangles(), ...wallTriangles()]);
    const face = floodFillFace(geometry, 0, 100);
    expect(face).toHaveLength(10);
  });

  it('always includes the seed, even when it is isolated', () => {
    const geometry = soup([
      [[0, 0, 0], [0, 0, 1], [1, 0, 0]],
      [[10, 0, 0], [10, 0, 1], [11, 0, 0]],
    ]);
    expect(floodFillFace(geometry, 1, 5)).toEqual([1]);
  });

  it('works on an indexed geometry', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1]), 3),
    );
    geometry.setIndex([0, 1, 2, 2, 1, 3]);
    expect(floodFillFace(geometry, 0, 5).sort()).toEqual([0, 1]);
  });

  it('does not merge a neighbour whose normal is NaN', () => {
    const geometry = soup([
      [[0, 0, 0], [0, 0, 1], [1, 0, 0]],
      [[0, 0, 1], [1, 0, 0], [Number.NaN, Number.NaN, Number.NaN]],
    ]);
    expect(floodFillFace(geometry, 0, 5)).toEqual([0]);
  });

  it.each([-1, 8, 1000])('returns an empty list for the out-of-range seed %i', (seed) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const geometry = soup(floorTriangles());
    expect(floodFillFace(geometry, seed, 10)).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });
});

import * as THREE from 'three';

const ADJACENCY_KEY = '__triAdjacency';
const ORIGINAL_INDEX_KEY = '__originalIndex';

/**
 * Quantization precision for the position-keyed adjacency map.
 *
 * Vertices that round to the same `(x*1000, y*1000, z*1000)` are
 * considered colocated. 0.1 mm is well below any tolerance the house
 * model needs, while still being coarse enough to merge near-duplicate
 * vertices at material/UV seams.
 */
const POS_PRECISION = 1000;

/**
 * Vertex count below which a 16-bit index buffer can address every vertex
 * (indices run 0 to 65535).
 */
const UINT16_VERTEX_LIMIT = 65536;

/**
 * Numeric key of the undirected edge between two position ids, in a space
 * of `idCount` ids: `low * idCount + high`. Unique per pair and well below
 * 2^53 for any mesh a browser can hold.
 */
export function edgeKey(idA: number, idB: number, idCount: number): number {
  return idA < idB ? idA * idCount + idB : idB * idCount + idA;
}

/**
 * Per-triangle adjacency list. `adjacency[t]` is the list of triangle
 * indices that share at least one edge with triangle `t`.
 */
type Adjacency = number[][];

/**
 * Synthesizes an identity index for a non-indexed geometry (triangle soup
 * where every triangle has its own three vertices, common in FBX exports).
 *
 * The index is attached to the geometry so subsequent operations
 * (adjacency, flood-fill, face splitting) all work uniformly against an
 * indexed geometry.
 */
export function ensureIndexed(geometry: THREE.BufferGeometry): THREE.BufferAttribute {
  const existing = geometry.getIndex();
  if (existing) return existing;
  const vertexCount = geometry.attributes.position.count;
  if (vertexCount % 3 !== 0) {
    throw new Error(
      `ensureIndexed: vertex count ${vertexCount} is not divisible by 3`,
    );
  }
  const TypedArray = vertexCount < UINT16_VERTEX_LIMIT ? Uint16Array : Uint32Array;
  const array = new TypedArray(vertexCount);
  for (let i = 0; i < vertexCount; i++) array[i] = i;
  const indexAttribute = new THREE.BufferAttribute(array, 1);
  geometry.setIndex(indexAttribute);
  return indexAttribute;
}

/**
 * Returns the geometry's ORIGINAL index buffer (every triangle of the body),
 * snapshotting it the first time. Triangle numbers used by the adjacency map,
 * the flood-fill and the face registry all address this buffer. The
 * geometry's live index is rewritten in place when faces are painted, so it
 * cannot be used to look up an original triangle.
 */
export function getOriginalIndex(geometry: THREE.BufferGeometry): THREE.BufferAttribute {
  let saved = geometry.userData[ORIGINAL_INDEX_KEY] as THREE.BufferAttribute | undefined;
  if (!saved) {
    saved = ensureIndexed(geometry).clone();
    geometry.userData[ORIGINAL_INDEX_KEY] = saved;
  }
  return saved;
}

/**
 * Builds an edge-based triangle adjacency keyed by ROUNDED vertex position
 * (not by vertex index).
 *
 * FBX exports often duplicate vertices at material / UV seams, so two
 * adjacent triangles that share a physical edge will have different
 * vertex indices for that edge. Keying by position handles that correctly.
 *
 * The result is cached on `geometry.userData` so we only pay this once
 * per body, no matter how many flood-fills run against it.
 */
export function buildAdjacency(geometry: THREE.BufferGeometry): Adjacency {
  const cached = geometry.userData[ADJACENCY_KEY] as Adjacency | undefined;
  if (cached) return cached;

  const indexAttribute = getOriginalIndex(geometry);
  const position = geometry.attributes.position;
  const triCount = indexAttribute.count / 3;

  // Colocated vertices share one compact id, so an edge is the pair of two
  // small integers and its map key is a single number (no string building
  // per edge).
  const vertexCount = position.count;
  const idByPosition = new Map<string, number>();
  const positionIdOfVertex = new Int32Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    const x = Math.round(position.getX(v) * POS_PRECISION);
    const y = Math.round(position.getY(v) * POS_PRECISION);
    const z = Math.round(position.getZ(v) * POS_PRECISION);
    const key = `${x},${y},${z}`;
    let id = idByPosition.get(key);
    if (id === undefined) {
      id = idByPosition.size;
      idByPosition.set(key, id);
    }
    positionIdOfVertex[v] = id;
  }

  const idCount = idByPosition.size;
  const edgeToTris = new Map<number, number[]>();
  const triEdges = new Float64Array(triCount * 3);

  for (let t = 0; t < triCount; t++) {
    const a = positionIdOfVertex[indexAttribute.getX(t * 3)];
    const b = positionIdOfVertex[indexAttribute.getX(t * 3 + 1)];
    const c = positionIdOfVertex[indexAttribute.getX(t * 3 + 2)];
    triEdges[t * 3] = edgeKey(a, b, idCount);
    triEdges[t * 3 + 1] = edgeKey(b, c, idCount);
    triEdges[t * 3 + 2] = edgeKey(a, c, idCount);
    for (let e = 0; e < 3; e++) {
      const key = triEdges[t * 3 + e];
      let list = edgeToTris.get(key);
      if (!list) {
        list = [];
        edgeToTris.set(key, list);
      }
      list.push(t);
    }
  }

  const adjacency: Adjacency = new Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const neighbors = new Set<number>();
    for (let e = 0; e < 3; e++) {
      const list = edgeToTris.get(triEdges[t * 3 + e]);
      if (!list) continue;
      for (const other of list) if (other !== t) neighbors.add(other);
    }
    adjacency[t] = [...neighbors];
  }

  geometry.userData[ADJACENCY_KEY] = adjacency;
  return adjacency;
}

// Scratch vectors reused across `triNormal` calls, which avoids allocating a
// new `Vector3` per triangle during a flood-fill.
const SCRATCH_VA = new THREE.Vector3();
const SCRATCH_VB = new THREE.Vector3();
const SCRATCH_VC = new THREE.Vector3();
const SCRATCH_AB = new THREE.Vector3();
const SCRATCH_AC = new THREE.Vector3();

/** Writes the unit normal of original triangle `triIndex` into `out`. */
function triNormal(
  geometry: THREE.BufferGeometry,
  indexAttribute: THREE.BufferAttribute,
  triIndex: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const position = geometry.attributes.position;
  const a = indexAttribute.getX(triIndex * 3);
  const b = indexAttribute.getX(triIndex * 3 + 1);
  const c = indexAttribute.getX(triIndex * 3 + 2);
  SCRATCH_VA.fromBufferAttribute(position, a);
  SCRATCH_VB.fromBufferAttribute(position, b);
  SCRATCH_VC.fromBufferAttribute(position, c);
  SCRATCH_AB.subVectors(SCRATCH_VB, SCRATCH_VA);
  SCRATCH_AC.subVectors(SCRATCH_VC, SCRATCH_VA);
  return out.crossVectors(SCRATCH_AB, SCRATCH_AC).normalize();
}

/**
 * Flood-fills from a seed triangle through edge-neighbors, expanding only
 * to triangles whose normal stays within `toleranceDeg` of the seed normal.
 *
 * The result is the original-index list of triangles forming the
 * "CAD face" the user clicked.
 */
export function floodFillFace(
  geometry: THREE.BufferGeometry,
  seedTriIndex: number,
  toleranceDeg: number,
): number[] {
  const adjacency = buildAdjacency(geometry);

  // Defensive: bail on out-of-range seeds. Can happen when a paint map
  // saved against one geometry is replayed against a different one
  // (e.g. the FBX got re-exported with different topology).
  if (seedTriIndex < 0 || seedTriIndex >= adjacency.length) {
    console.warn(
      `[floodFill] seed ${seedTriIndex} out of range (max ${adjacency.length - 1}), skipping face`,
    );
    return [];
  }

  const originalIndex = getOriginalIndex(geometry);
  const seedNormal = new THREE.Vector3();
  triNormal(geometry, originalIndex, seedTriIndex, seedNormal);
  const cosineThreshold = Math.cos((toleranceDeg * Math.PI) / 180);
  const candidateNormal = new THREE.Vector3();

  const visited = new Set<number>();
  visited.add(seedTriIndex);
  const queue: number[] = [seedTriIndex];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    const neighbors = adjacency[current];
    for (let i = 0; i < neighbors.length; i++) {
      const neighbor = neighbors[i];
      if (visited.has(neighbor)) continue;
      triNormal(geometry, originalIndex, neighbor, candidateNormal);
      // Written as a negated `>=` so a NaN normal (corrupt positions) fails
      // the test instead of passing every comparison.
      if (!(candidateNormal.dot(seedNormal) >= cosineThreshold)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }

  return [...visited];
}

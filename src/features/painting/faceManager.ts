import * as THREE from 'three';
import { getOriginalIndex as getGeometryOriginalIndex } from './floodFill';

const FACE_REGISTRY_KEY = '__faceRegistry';
const CURRENT_TO_ORIGINAL_KEY = '__currentToOriginal';
const ORIGINAL_GROUPS_KEY = '__originalGroups';

/** One entry of `BufferGeometry.groups`: a run of indices drawn with one material slot. */
type GeometryGroup = { start: number; count: number; materialIndex?: number };

/**
 * Name prefix used on the child meshes that render a painted face.
 *
 * The walkthrough relies on this prefix to detect "face meshes" during
 * paint-application (`paintApply.ts`) and to skip them when walking up
 * the scene graph to find the underlying body name.
 */
export const FACE_MESH_NAME_PREFIX = '__face/';

type FaceEntry = {
  seedTriIndex: number;
  triIndices: number[];
  mesh: THREE.Mesh;
};

type FaceRegistry = Map<number, FaceEntry>;

/** Lazily creates the per-body registry of painted faces. */
function getRegistry(parent: THREE.Mesh): FaceRegistry {
  let registry = parent.userData[FACE_REGISTRY_KEY] as FaceRegistry | undefined;
  if (!registry) {
    registry = new Map();
    parent.userData[FACE_REGISTRY_KEY] = registry;
  }
  return registry;
}

/**
 * Returns the geometry's ORIGINAL index buffer, snapshotting it the first
 * time. The original is the canonical "every triangle of the body" buffer.
 * Every face removal / restore is computed relative to it.
 */
function getOriginalIndex(parent: THREE.Mesh): THREE.BufferAttribute {
  const saved = getGeometryOriginalIndex(parent.geometry);
  // Groups are only rewritten by `rebuildParentIndex`, so until the first
  // face exists they are still the original ones.
  if (!parent.userData[ORIGINAL_GROUPS_KEY]) {
    parent.userData[ORIGINAL_GROUPS_KEY] = parent.geometry.groups.map((group) => ({ ...group }));
  }
  return saved;
}

/**
 * Returns the index attribute the parent geometry renders from. It is a
 * separate attribute from the saved original and is rewritten in place for
 * the lifetime of the body: `BufferAttribute.dispose()` does nothing in
 * `WebGLRenderer`, so replacing the attribute on every paint would leave one
 * orphaned GPU buffer per change.
 */
function getWorkingIndex(parent: THREE.Mesh, original: THREE.BufferAttribute): THREE.BufferAttribute {
  const current = parent.geometry.getIndex();
  if (current && current !== original && current.array.length === original.array.length) {
    return current;
  }
  const working = original.clone();
  parent.geometry.setIndex(working);
  return working;
}

/**
 * Rewrites `geometry.groups` for a reduced index buffer. Group offsets are
 * measured in indices, so removing triangles shifts every later group;
 * leaving the originals in place would draw the wrong triangles with the
 * wrong material slot and break raycasting on multi-material meshes.
 * `keptOriginalTris` lists the surviving original triangle numbers in
 * ascending order, which is also their order in the new index buffer.
 */
function rebuildGroups(
  geometry: THREE.BufferGeometry,
  originalGroups: GeometryGroup[],
  keptOriginalTris: number[],
): void {
  geometry.clearGroups();
  let cursor = 0;
  for (const group of originalGroups) {
    const firstTri = group.start / 3;
    const endTri = (group.start + group.count) / 3;
    while (cursor < keptOriginalTris.length && keptOriginalTris[cursor] < firstTri) cursor++;
    const groupFirst = cursor;
    while (cursor < keptOriginalTris.length && keptOriginalTris[cursor] < endTri) cursor++;
    const kept = cursor - groupFirst;
    if (kept > 0) geometry.addGroup(groupFirst * 3, kept * 3, group.materialIndex);
  }
}

/**
 * Releases a face mesh's geometry. Its vertex attributes belong to the
 * parent, and `BufferGeometry.dispose()` would free their GPU buffers while
 * the parent's cached bindings still point at them, so the shared
 * attributes are detached first. Only the face's own index buffer and its
 * renderer bookkeeping are released.
 */
function disposeFaceGeometry(geometry: THREE.BufferGeometry): void {
  for (const name of Object.keys(geometry.attributes)) geometry.deleteAttribute(name);
  geometry.dispose();
}

/**
 * Rewrites the parent's index so it lists `original − union(painted face
 * triangles)` in its first `kept * 3` entries and draws only that range.
 *
 * Also stores the current → original triangle mapping so click events on
 * the parent (which give a `faceIndex` into the CURRENT index buffer) can
 * be translated to stable original-space indices for flood-fill seeding.
 */
function rebuildParentIndex(parent: THREE.Mesh): void {
  const original = getOriginalIndex(parent);
  const registry = getRegistry(parent);
  const working = getWorkingIndex(parent, original);
  const originalGroups = parent.userData[ORIGINAL_GROUPS_KEY] as GeometryGroup[];

  if (registry.size === 0) {
    working.array.set(original.array);
    working.needsUpdate = true;
    parent.geometry.setDrawRange(0, Infinity);
    parent.geometry.clearGroups();
    for (const group of originalGroups) {
      parent.geometry.addGroup(group.start, group.count, group.materialIndex);
    }
    delete parent.userData[CURRENT_TO_ORIGINAL_KEY];
    return;
  }

  const removed = new Set<number>();
  for (const entry of registry.values()) {
    for (const triIndex of entry.triIndices) removed.add(triIndex);
  }

  const originalTriCount = original.count / 3;
  const keptOriginalTris: number[] = [];
  for (let t = 0; t < originalTriCount; t++) {
    if (!removed.has(t)) keptOriginalTris.push(t);
  }

  const target = working.array;
  for (let i = 0; i < keptOriginalTris.length; i++) {
    const t = keptOriginalTris[i];
    target[i * 3] = original.getX(t * 3);
    target[i * 3 + 1] = original.getX(t * 3 + 1);
    target[i * 3 + 2] = original.getX(t * 3 + 2);
  }
  working.needsUpdate = true;

  parent.geometry.setDrawRange(0, keptOriginalTris.length * 3);
  if (originalGroups.length > 0) rebuildGroups(parent.geometry, originalGroups, keptOriginalTris);
  parent.userData[CURRENT_TO_ORIGINAL_KEY] = keptOriginalTris;
}

/**
 * Builds a child geometry that renders only the triangles in `triIndices`.
 *
 * Vertex attributes (position, normal, …) are SHARED with the parent:
 * the same `BufferAttribute` instances are reused. The renderer keys
 * buffers by attribute, so this is safe and avoids duplicating thousands
 * of vertices.
 */
function buildFaceGeometry(
  parent: THREE.Mesh,
  triIndices: number[],
): THREE.BufferGeometry {
  const original = getOriginalIndex(parent);
  const TypedArray = original.array.constructor as
    | Uint16ArrayConstructor
    | Uint32ArrayConstructor;
  const array = new TypedArray(triIndices.length * 3);
  for (let i = 0; i < triIndices.length; i++) {
    const t = triIndices[i];
    array[i * 3] = original.getX(t * 3);
    array[i * 3 + 1] = original.getX(t * 3 + 1);
    array[i * 3 + 2] = original.getX(t * 3 + 2);
  }

  const child = new THREE.BufferGeometry();
  for (const name of Object.keys(parent.geometry.attributes)) {
    child.setAttribute(name, parent.geometry.attributes[name]);
  }
  child.setIndex(new THREE.BufferAttribute(array, 1));
  return child;
}

/**
 * Adds a new painted face child, or, when the seed already exists,
 * swaps the material in place without rebuilding geometry.
 */
export function addOrUpdateFace(
  parent: THREE.Mesh,
  bodyName: string,
  seedTriIndex: number,
  triIndices: number[],
  material: THREE.Material,
): THREE.Mesh {
  const registry = getRegistry(parent);
  const existing = registry.get(seedTriIndex);

  if (existing) {
    const previousMaterial = existing.mesh.material as THREE.Material;
    existing.mesh.material = material;
    if (previousMaterial !== material) previousMaterial?.dispose?.();
    return existing.mesh;
  }

  const geometry = buildFaceGeometry(parent, triIndices);
  const faceMesh = new THREE.Mesh(geometry, material);
  faceMesh.name = `${FACE_MESH_NAME_PREFIX}${seedTriIndex}`;
  faceMesh.castShadow = true;
  faceMesh.receiveShadow = true;
  faceMesh.frustumCulled = false;
  faceMesh.userData.isFace = true;
  faceMesh.userData.bodyName = bodyName;
  faceMesh.userData.seedTriIndex = seedTriIndex;

  parent.add(faceMesh);
  registry.set(seedTriIndex, { seedTriIndex, triIndices, mesh: faceMesh });
  rebuildParentIndex(parent);
  return faceMesh;
}

/** Removes one painted face by seed. No-op when the seed is unknown. */
export function removeFace(parent: THREE.Mesh, seedTriIndex: number): void {
  const registry = parent.userData[FACE_REGISTRY_KEY] as FaceRegistry | undefined;
  if (!registry) return;
  const entry = registry.get(seedTriIndex);
  if (!entry) return;

  parent.remove(entry.mesh);
  disposeFaceGeometry(entry.mesh.geometry);
  (entry.mesh.material as THREE.Material).dispose?.();

  registry.delete(seedTriIndex);
  rebuildParentIndex(parent);
}

/** Removes every painted face on a body in one pass. */
export function removeAllFaces(parent: THREE.Mesh): void {
  const registry = parent.userData[FACE_REGISTRY_KEY] as FaceRegistry | undefined;
  if (!registry || registry.size === 0) return;
  for (const entry of [...registry.values()]) {
    parent.remove(entry.mesh);
    disposeFaceGeometry(entry.mesh.geometry);
    (entry.mesh.material as THREE.Material).dispose?.();
  }
  registry.clear();
  rebuildParentIndex(parent);
}

/** Returns a read-only view of the currently-painted faces of a body. */
export function listFaces(parent: THREE.Mesh): readonly FaceEntry[] {
  const registry = parent.userData[FACE_REGISTRY_KEY] as FaceRegistry | undefined;
  return registry ? [...registry.values()] : [];
}

/**
 * Translates a click's `faceIndex` (which addresses the CURRENT, possibly
 * face-reduced, index buffer) back to the stable original triangle index
 * we use as the face's identity.
 */
export function currentTriToOriginal(parent: THREE.Mesh, currentTriIndex: number): number {
  const mapping = parent.userData[CURRENT_TO_ORIGINAL_KEY] as number[] | undefined;
  if (!mapping) return currentTriIndex;
  return mapping[currentTriIndex] ?? currentTriIndex;
}

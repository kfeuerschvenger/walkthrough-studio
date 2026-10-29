import * as THREE from 'three';
import type { Texture } from './types';
import type { BodyPaint, FacePaint } from './paintTypes';
import { getTexture } from './textureCache';
import {
  createTriplanarMaterial,
  disposeTriplanarMaterials,
  getTriplanarTextureId,
  isTriplanarMaterial,
  updateTriplanarScale,
} from './triplanarMaterial';
import {
  addOrUpdateFace,
  listFaces,
  removeAllFaces,
  removeFace,
} from './faceManager';
import { floodFillFace } from './floodFill';
import { createLatestWinsRunner, type StaleCheck } from './latestWins';
import { patchUndefinedMaterialsInTree } from '../house/materialPatch';

/**
 * Walks up parents from the given object until it finds a non-empty,
 * non-face-mesh name.
 *
 * Face child meshes are tagged with `userData.isFace`, and they are skipped so
 * painting a face still resolves to the underlying body.
 */
export function findBodyName(obj: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = obj;
  while (current) {
    if (current.userData?.isFace) {
      const bodyName = current.userData.bodyName as string | undefined;
      if (bodyName) return bodyName;
    } else if (current.name) {
      return current.name;
    }
    current = current.parent;
  }
  return null;
}

/** Returns every non-face mesh that belongs to the named body. */
export function findMeshesForBody(
  root: THREE.Object3D,
  bodyName: string,
): THREE.Mesh[] {
  const matches: THREE.Mesh[] = [];
  let node: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (!node && child.name === bodyName) node = child;
  });
  if (!node) return matches;
  (node as THREE.Object3D).traverse((descendant) => {
    const mesh = descendant as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData?.isFace) matches.push(mesh);
  });
  return matches;
}

/**
 * Returns the first non-face mesh of a body, used as the canonical
 * owner of FacePaint entries for that body.
 */
export function findPrimaryBodyMesh(
  root: THREE.Object3D,
  bodyName: string,
): THREE.Mesh | null {
  const meshes = findMeshesForBody(root, bodyName);
  return meshes[0] ?? null;
}

const ORIGINAL_MATERIAL_KEY = '__originalMaterial';

/** Snapshots the mesh's pre-paint material so we can restore it later. */
function rememberOriginal(mesh: THREE.Mesh): void {
  if (!mesh.userData[ORIGINAL_MATERIAL_KEY]) {
    mesh.userData[ORIGINAL_MATERIAL_KEY] = mesh.material;
  }
}

/**
 * Restores the original material on a mesh and disposes any triplanar
 * material we created while it was painted. Single materials, arrays,
 * and mixed arrays are all handled.
 */
function restoreOriginal(mesh: THREE.Mesh): void {
  const original = mesh.userData[ORIGINAL_MATERIAL_KEY] as
    | THREE.Material
    | THREE.Material[]
    | undefined;
  if (!original) return;
  disposeTriplanarMaterials(mesh.material);
  mesh.material = original;
}

/**
 * Releases everything painting created under `root`: the face meshes with
 * their geometries and materials, and the triplanar body materials. Bodies
 * go back to their original material, so the tree stays consistent if it is
 * rendered or repainted afterwards. Call it before disposing the body
 * geometries.
 */
export function disposePaintResources(root: THREE.Object3D): void {
  // Collected first: removing face meshes while traversing would skip nodes.
  const bodies: THREE.Mesh[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData?.isFace) bodies.push(mesh);
  });
  for (const mesh of bodies) {
    removeAllFaces(mesh);
    restoreOriginal(mesh);
  }
}

/**
 * Loads a texture through the cache. A failure is logged and reported as
 * `null`, so a texture that cannot load skips its paint instead of
 * aborting the whole reconcile.
 */
async function loadTextureOrWarn(meta: Texture): Promise<THREE.Texture | null> {
  try {
    return await getTexture(meta.id, meta.url);
  } catch (error) {
    console.warn('[paintApply] failed to load texture', meta.filename, error);
    return null;
  }
}

/**
 * One reconcile pass over the body paints. `isStale` turns true once a
 * newer call has been scheduled; it is checked after every await so a
 * superseded pass stops before it creates materials nobody will keep.
 */
async function reconcileBodyPaints(
  root: THREE.Object3D,
  bodyPaints: BodyPaint[],
  textures: Texture[],
  isStale: StaleCheck,
): Promise<void> {
  patchUndefinedMaterialsInTree(root);
  const paintByBody = new Map(bodyPaints.map((p) => [p.bodyName, p]));
  const texturesById = new Map(textures.map((t) => [t.id, t]));

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData?.isFace) return; // face child meshes have their own lifecycle
    const current = mesh.material;
    const isPainted = Array.isArray(current)
      ? current.some(isTriplanarMaterial)
      : isTriplanarMaterial(current);
    if (!isPainted) return;
    const name = findBodyName(mesh);
    if (!name || !paintByBody.has(name)) restoreOriginal(mesh);
  });

  await Promise.all(
    bodyPaints.map(async (paint) => {
      const textureMeta = texturesById.get(paint.textureId);
      if (!textureMeta) return;
      const meshes = findMeshesForBody(root, paint.bodyName);
      if (meshes.length === 0) return;

      let texture: THREE.Texture | null = null;
      for (const mesh of meshes) {
        const currentMaterial = mesh.material;
        const head = Array.isArray(currentMaterial) ? currentMaterial[0] : currentMaterial;
        const sameTexture =
          head && isTriplanarMaterial(head)
            ? getTriplanarTextureId(head) === paint.textureId
            : false;

        if (sameTexture && head) {
          updateTriplanarScale(head, textureMeta.scale);
          continue;
        }

        texture ??= await loadTextureOrWarn(textureMeta);
        if (!texture || isStale()) return;

        rememberOriginal(mesh);
        disposeTriplanarMaterials(mesh.material);
        mesh.material = createTriplanarMaterial(texture, paint.textureId, textureMeta.scale);
      }
    }),
  );
}

/**
 * One reconcile pass over the face paints. See {@link reconcileBodyPaints}
 * for the meaning of `isStale`.
 */
async function reconcileFacePaints(
  root: THREE.Object3D,
  facePaints: FacePaint[],
  textures: Texture[],
  isStale: StaleCheck,
): Promise<void> {
  patchUndefinedMaterialsInTree(root);
  const texturesById = new Map(textures.map((t) => [t.id, t]));

  // Group face paints by body name.
  const byBody = new Map<string, FacePaint[]>();
  for (const facePaint of facePaints) {
    let list = byBody.get(facePaint.bodyName);
    if (!list) {
      list = [];
      byBody.set(facePaint.bodyName, list);
    }
    list.push(facePaint);
  }

  // Drop face meshes from bodies that have no face paints in the scene.
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData?.isFace) return;
    const faces = listFaces(mesh);
    if (faces.length === 0) return;
    const bodyName = findBodyName(mesh);
    if (!bodyName || !byBody.has(bodyName)) {
      removeAllFaces(mesh);
    }
  });

  // For each body with face paints: reconcile.
  await Promise.all(
    [...byBody.entries()].map(async ([bodyName, paints]) => {
      const parent = findPrimaryBodyMesh(root, bodyName);
      if (!parent) return;

      const desiredSeeds = new Set(paints.map((p) => p.seedTriIndex));
      for (const face of [...listFaces(parent)]) {
        if (!desiredSeeds.has(face.seedTriIndex)) removeFace(parent, face.seedTriIndex);
      }

      for (const paint of paints) {
        const textureMeta = texturesById.get(paint.textureId);
        if (!textureMeta) continue;

        const existing = listFaces(parent).find(
          (f) => f.seedTriIndex === paint.seedTriIndex,
        );
        if (existing) {
          const material = existing.mesh.material as THREE.Material;
          if (
            isTriplanarMaterial(material) &&
            getTriplanarTextureId(material) === paint.textureId
          ) {
            updateTriplanarScale(material, textureMeta.scale);
            continue;
          }
          // Texture changed → swap material (geometry stays).
          const texture = await loadTextureOrWarn(textureMeta);
          if (!texture) continue;
          if (isStale()) return;
          addOrUpdateFace(
            parent,
            bodyName,
            paint.seedTriIndex,
            existing.triIndices,
            createTriplanarMaterial(texture, paint.textureId, textureMeta.scale),
          );
          continue;
        }

        // Brand new face: flood-fill and create.
        const texture = await loadTextureOrWarn(textureMeta);
        if (!texture) continue;
        if (isStale()) return;
        const triIndices = floodFillFace(
          parent.geometry,
          paint.seedTriIndex,
          paint.normalToleranceDeg,
        );
        if (triIndices.length === 0) continue; // stale seed, skip
        addOrUpdateFace(
          parent,
          bodyName,
          paint.seedTriIndex,
          triIndices,
          createTriplanarMaterial(texture, paint.textureId, textureMeta.scale),
        );
      }
    }),
  );
}

type BodyRunner = (bodyPaints: BodyPaint[], textures: Texture[]) => Promise<void>;
type FaceRunner = (facePaints: FacePaint[], textures: Texture[]) => Promise<void>;

/**
 * One scheduler per scene root, so the editor and the walkthrough (each
 * with its own house instance) never block or cancel each other.
 */
const bodyRunners = new WeakMap<THREE.Object3D, BodyRunner>();
const faceRunners = new WeakMap<THREE.Object3D, FaceRunner>();

/**
 * Reconciles body paints against the live scene.
 *
 * For each body paint:
 *  - meshes whose paint was removed are restored to their original material
 *  - meshes that keep the same texture get a scale update on their uniform
 *  - meshes that change texture get a new triplanar material
 *
 * Calls for the same root are serialized with latest-wins semantics (see
 * `latestWins.ts`): callers fire this on every state change without
 * awaiting, and overlapping runs can neither interleave nor leak the
 * materials a superseded run would have created. The promise resolves once
 * the newest arguments have been applied.
 */
export function applyBodyPaints(
  root: THREE.Object3D,
  bodyPaints: BodyPaint[],
  textures: Texture[],
): Promise<void> {
  let run = bodyRunners.get(root);
  if (!run) {
    run = createLatestWinsRunner((isStale, paints: BodyPaint[], available: Texture[]) =>
      reconcileBodyPaints(root, paints, available, isStale),
    );
    bodyRunners.set(root, run);
  }
  return run(bodyPaints, textures);
}

/**
 * Reconciles face paints against face child meshes per body. For each body:
 *  - drops face meshes whose seed is no longer in `facePaints`
 *  - swaps material when the texture changed
 *  - updates the triplanar scale uniform when only scale changed
 *  - creates new face meshes (flood-fills) for new face paints
 *
 * Scheduled like {@link applyBodyPaints}: serialized per root, latest wins.
 * Serialization matters most here, because every pass reads and rewrites
 * the per-body face registry and the parent's index buffer.
 */
export function applyFacePaints(
  root: THREE.Object3D,
  facePaints: FacePaint[],
  textures: Texture[],
): Promise<void> {
  let run = faceRunners.get(root);
  if (!run) {
    run = createLatestWinsRunner((isStale, paints: FacePaint[], available: Texture[]) =>
      reconcileFacePaints(root, paints, available, isStale),
    );
    faceRunners.set(root, run);
  }
  return run(facePaints, textures);
}

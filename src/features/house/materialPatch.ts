import * as THREE from 'three';

/** Grey of the stand-in material used for missing material slots. */
export const FALLBACK_MATERIAL_COLOR = 0x888888;

/** Builds the neutral stand-in used where a mesh has no material. */
function createFallbackMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: FALLBACK_MATERIAL_COLOR });
}

/**
 * Fills every missing material on a mesh with a neutral stand-in: the
 * whole material when it is absent, and every hole (or missing slot a
 * geometry group points at) when it is a multi-material array.
 *
 * three.js' raycaster reads `material.side` without guarding null /
 * undefined, so a single hole crashes picking for the whole scene. Fusion
 * 360 exports produce these holes.
 */
export function patchUndefinedMaterials(mesh: THREE.Mesh): void {
  if (!mesh.material) {
    mesh.material = createFallbackMaterial();
    return;
  }
  if (!Array.isArray(mesh.material)) return;

  let requiredLength = mesh.material.length;
  for (const group of mesh.geometry.groups) {
    if (group.materialIndex !== undefined && group.materialIndex + 1 > requiredLength) {
      requiredLength = group.materialIndex + 1;
    }
  }
  for (let i = 0; i < requiredLength; i++) {
    if (!mesh.material[i]) mesh.material[i] = createFallbackMaterial();
  }
}

/** Applies {@link patchUndefinedMaterials} to every mesh under `root`. */
export function patchUndefinedMaterialsInTree(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) patchUndefinedMaterials(mesh);
  });
}

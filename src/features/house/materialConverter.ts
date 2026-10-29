import * as THREE from 'three';

/**
 * Subset of material properties we read while converting a Phong / Lambert
 * material to a MeshStandardMaterial. Declared as an intersection so the
 * code can access these fields without three.js making us narrow the type
 * for every legacy material flavor.
 */
type AnyMaterial = THREE.Material & {
  color?: THREE.Color;
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  aoMap?: THREE.Texture | null;
  emissive?: THREE.Color;
  emissiveMap?: THREE.Texture | null;
  emissiveIntensity?: number;
  shininess?: number;
};

/**
 * Returns a function that converts any non-standard material into a
 * `MeshStandardMaterial`, copying over the common visual properties
 * (color, maps, side, transparency, …).
 *
 * The conversion is cached by source UUID, so a Phong material shared
 * across many meshes becomes a single Standard material shared across
 * the same meshes, with no per-mesh duplication.
 *
 * Why this is required: `RectAreaLight` only illuminates Standard /
 * Physical materials. Phong materials silently ignore it, which means
 * any user-placed area light would look dead on the unconverted FBX
 * meshes.
 */
export function makeStandardConverter(): (material: THREE.Material) => THREE.MeshStandardMaterial {
  const cache = new Map<string, THREE.MeshStandardMaterial>();

  return function ensureStandard(material: THREE.Material): THREE.MeshStandardMaterial {
    if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
      return material as THREE.MeshStandardMaterial;
    }
    const cached = cache.get(material.uuid);
    if (cached) return cached;

    const source = material as AnyMaterial;
    const standard = new THREE.MeshStandardMaterial();
    standard.name = source.name;
    if (source.color) standard.color.copy(source.color);
    if (source.map) standard.map = source.map;
    if (source.normalMap) standard.normalMap = source.normalMap;
    if (source.aoMap) standard.aoMap = source.aoMap;
    if (source.emissive) standard.emissive.copy(source.emissive);
    if (typeof source.emissiveIntensity === 'number') {
      standard.emissiveIntensity = source.emissiveIntensity;
    }
    if (source.emissiveMap) standard.emissiveMap = source.emissiveMap;
    standard.metalness = 0;

    // Phong shininess (0…1000+) → roughness (0…1), inverse-ish.
    const shininess = typeof source.shininess === 'number' ? source.shininess : 0;
    standard.roughness =
      shininess > 0 ? Math.max(0.05, Math.min(1, 1 - shininess / 100)) : 0.85;

    standard.side = source.side;
    standard.transparent = source.transparent;
    standard.opacity = source.opacity;
    standard.alphaTest = source.alphaTest;
    standard.depthWrite = source.depthWrite;

    cache.set(material.uuid, standard);
    return standard;
  };
}

import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { FBXLoader, GLTFLoader, type GLTF } from 'three-stdlib';
import { makeStandardConverter } from './materialConverter';
import { GROUND_NAME_HINTS, HOUSE_URL } from './houseConfig';
import { patchUndefinedMaterials } from './materialPatch';
import { disposePaintResources } from '../painting/paintApply';
import { unitScaleForDimension } from './modelUnits';

/** What either loader produces: an FBX `Group` or a glTF result. */
type LoadedModel = THREE.Group | GLTF;

/** Loader constructor accepted by `useLoader`, whichever format it reads. */
type ModelLoaderClass = new () => THREE.Loader<LoadedModel>;

/** True when the URL path (ignoring query and hash) ends in `.glb` / `.gltf`. */
function isGltfUrl(url: string): boolean {
  const path = url.split(/[?#]/)[0].toLowerCase();
  return path.endsWith('.glb') || path.endsWith('.gltf');
}

/**
 * Picks the loader from the file extension: glTF for `.glb` / `.gltf`,
 * FBX for everything else. Returns the same constructor for the same URL,
 * which `useLoader` needs to key its cache.
 */
function loaderFor(url: string): ModelLoaderClass {
  return (isGltfUrl(url) ? GLTFLoader : FBXLoader) as unknown as ModelLoaderClass;
}

/** The renderable root of a loaded model, whichever loader produced it. */
function rootOf(model: LoadedModel): THREE.Object3D {
  return 'scene' in model ? model.scene : model;
}

type HouseProps = {
  /**
   * Path to the model (`.fbx`, `.glb` or `.gltf`). Defaults to
   * `VITE_HOUSE_URL`, which itself defaults to the bundled demo house.
   */
  url?: string;
  /**
   * Called once with the normalized scene root after load. Use this to
   * apply paint state, attach handlers, etc.
   */
  onReady?: (root: THREE.Object3D) => void;
};

/**
 * Loads the house model, normalizes units (mm / cm / m to m), and anchors
 * the ground at `y = 0`. FBX models also get their up-axis detected from
 * the bounding box; glTF is Y-up by specification, so that guess is
 * skipped for it.
 *
 * The ground is the top face of the mesh whose name contains one of
 * `GROUND_NAME_HINTS` (`VITE_HOUSE_GROUND_HINTS`), or the lowest point of
 * the model when no mesh matches. The model is also recentered
 * horizontally, so `x = 0, z = 0` is the middle of its footprint.
 *
 * Materials are converted to `MeshStandardMaterial` so user-placed
 * RectAreaLights actually illuminate them. Undefined slots in
 * multi-material arrays are patched with a neutral fallback (Fusion 360
 * exports produce these, and the WebGL renderer trips on
 * `material[i].side` when slots are empty).
 *
 * All materials are forced opaque + double-sided so Blender / Fusion
 * transparency artifacts can't make geometry disappear at runtime.
 */
export default function House({ url = HOUSE_URL, onReady }: HouseProps) {
  const isGltf = isGltfUrl(url);
  const model = useLoader(loaderFor(url), url);
  const source = rootOf(model);

  const { object, ownedMaterials } = useMemo(() => {
    const root = source.clone(true);

    // Materials the loader produced stay with the loader cache. Anything
    // else found on the clone below was created here, so it is ours to free.
    const sourceMaterials = new Set<THREE.Material>();
    source.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material) sourceMaterials.add(material);
      }
    });

    // CRITICAL: deep-clone every geometry. three.js' `Mesh.copy` shares
    // geometry by reference, so face painting, which mutates the parent's
    // index buffer, would otherwise leak across House mounts via the
    // loader cache. The walkthrough would render with holes where faces
    // painted in the editor were removed from the shared index.
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry = mesh.geometry.clone();
    });

    let box = new THREE.Box3().setFromObject(root);
    let size = box.getSize(new THREE.Vector3());

    // Normalize units to meters by guessing the source scale from the
    // bounding box (see `unitScaleForDimension`).
    root.scale.setScalar(unitScaleForDimension(Math.max(size.x, size.y, size.z)));
    root.updateMatrixWorld(true);

    box = new THREE.Box3().setFromObject(root);
    size = box.getSize(new THREE.Vector3());

    // Detect up-axis from the bounding box shape and re-orient if needed.
    // The smallest extent is almost always the "up" axis of an FBX source.
    // glTF mandates Y-up, and a low, wide glTF house would fool the guess.
    if (!isGltf) {
      if (size.z < size.y && size.z < size.x) {
        root.rotation.x = -Math.PI / 2;
      } else if (size.x < size.y && size.x < size.z) {
        root.rotation.z = Math.PI / 2;
      }
    }
    root.updateMatrixWorld(true);

    box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());

    // Find the ground body by name hint, when hints are configured. The
    // names belong to the source model: we read them, we don't own them.
    const groundMatches: THREE.Object3D[] = [];
    if (GROUND_NAME_HINTS.length > 0) {
      root.traverse((child) => {
        const name = (child.name || '').toLowerCase();
        if (GROUND_NAME_HINTS.some((hint) => name.includes(hint))) {
          groundMatches.push(child);
        }
      });
    }

    const floorY =
      groundMatches.length > 0
        ? new THREE.Box3().setFromObject(groundMatches[0]).max.y
        : box.min.y;

    // Recenter horizontally and anchor the floor at world Y = 0.
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= floorY;

    const toStandard = makeStandardConverter();
    const owned = new Set<THREE.Material>();

    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // `frustumCulled = true` is the three.js default. Leaving it on lets
      // the renderer skip meshes outside each shadow camera's frustum,
      // which is critical because spot/directional lights re-render the
      // scene per shadow pass, and in a house most meshes aren't in any
      // given light's view.

      // 1. Patch undefined slots so the material array is fully populated.
      patchUndefinedMaterials(mesh);

      // 2. Convert every Phong/Lambert/etc. material to Standard so it
      //    receives RectAreaLight at night. glTF materials already are.
      if (Array.isArray(mesh.material)) {
        for (let i = 0; i < mesh.material.length; i++) {
          mesh.material[i] = toStandard(mesh.material[i]);
        }
      } else {
        mesh.material = toStandard(mesh.material);
      }

      // 3. Normalize visual settings on the (now-standard) materials.
      //
      //    `DoubleSide` is required: FBX files exported from Fusion 360
      //    can have face windings inverted on many wall surfaces, so
      //    `FrontSide` leaves those polygons unlit and they render solid
      //    black even at noon. The fragment-shader cost is real but the
      //    real shadow perf wins live elsewhere (per-light shadow gating,
      //    smaller shadow maps, frustum culling restored).
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!sourceMaterials.has(material)) owned.add(material);
        const standardMaterial = material as THREE.MeshStandardMaterial;
        standardMaterial.side = THREE.DoubleSide;
        standardMaterial.transparent = false;
        standardMaterial.opacity = 1;
        standardMaterial.alphaTest = 0;
        standardMaterial.depthWrite = true;
        standardMaterial.needsUpdate = true;
      }
    });

    return { object: root, ownedMaterials: owned };
  }, [source, isGltf]);

  // Frees what this component created: the paint materials and face meshes
  // (released first, while the body geometries are still intact), the cloned
  // geometries, and the converted or fallback materials. Disposal only
  // releases GPU resources, and three.js uploads them again if the same
  // objects are rendered afterwards, so running this between a StrictMode
  // unmount and remount is harmless.
  useEffect(() => {
    return () => {
      disposePaintResources(object);
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      for (const material of ownedMaterials) material.dispose();
    };
  }, [object, ownedMaterials]);

  useEffect(() => {
    onReady?.(object);
  }, [object, onReady]);

  return <primitive object={object} />;
}

// Preload the configured house so the model starts streaming as soon as
// the page mounts, instead of waiting for the Suspense boundary to read.
useLoader.preload(loaderFor(HOUSE_URL), HOUSE_URL);

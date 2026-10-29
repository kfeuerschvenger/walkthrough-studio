/// <reference types="vite/client" />

/**
 * Build-time variables read through `import.meta.env`. All of them are
 * optional; `src/features/house/houseConfig.ts` documents the defaults.
 */
interface ImportMetaEnv {
  /** URL of the house model. `.fbx` and `.glb`/`.gltf` are supported. */
  readonly VITE_HOUSE_URL?: string;
  /** Spawn point on the floor plane as `"x,z"` in meters. */
  readonly VITE_HOUSE_SPAWN?: string;
  /** Comma-separated mesh-name fragments that identify the ground body. */
  readonly VITE_HOUSE_GROUND_HINTS?: string;
  /** Rotation of the sun arc around the Y axis, in degrees. */
  readonly VITE_SUN_PATH_ROTATION_DEG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

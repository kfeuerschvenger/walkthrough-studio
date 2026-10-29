import * as THREE from 'three';
import type { LightShape, UserLight, Vec3 } from '../../../shared/sceneTypes';

/**
 * The light types live in `shared/sceneTypes.ts`, where the server reads
 * the same definitions. They are re-exported here so the lighting feature
 * keeps a local import path.
 */
export type { LightShape, LightTransform, UserLight, Vec3 } from '../../../shared/sceneTypes';

/**
 * Generates a unique id for a light. `crypto.randomUUID` exists only in
 * secure contexts (HTTPS or localhost), so the app served over plain HTTP
 * from a LAN address would throw on it. `crypto.getRandomValues` is
 * available everywhere, and builds an RFC 4122 version 4 UUID; the last
 * resort is `Math.random`, which is enough for ids that only need to be
 * unique within one scene.
 */
export function generateId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Gizmo modes exposed by drei's `TransformControls`. */
export type TransformMode = 'translate' | 'rotate' | 'scale';

/** Warm-white tint every new light starts with. */
const DEFAULT_LIGHT_COLOR = '#ffd599';

/** Per-shape starting values; everything else is shared by all shapes. */
type LightDefaults = {
  position: Vec3;
  scale: Vec3;
  intensity: number;
};

/**
 * Starting placement for each shape.
 *
 *  - `box`:    roughly room-ceiling height, a long thin strip.
 *  - `sphere`: typical hanging-lamp height.
 *  - `spot`:   same placement as the sphere (ceiling height, warm tint) so
 *              swapping between the two types stays predictable.
 */
const LIGHT_DEFAULTS: Record<LightShape, LightDefaults> = {
  box: { position: [0, 2.2, 0], scale: [2, 0.05, 0.2], intensity: 5 },
  sphere: { position: [0, 2.5, 0], scale: [0.15, 0.15, 0.15], intensity: 8 },
  spot: { position: [0, 2.5, 0], scale: [0.2, 0.2, 0.2], intensity: 8 },
};

/**
 * Factory for a new light of the given shape, with a fresh id, the shape's
 * default placement, and a warm-white color. Gives the user something
 * sensible to drag around immediately.
 */
export function createUserLight(shape: LightShape): UserLight {
  const defaults = LIGHT_DEFAULTS[shape];
  return {
    id: generateId(),
    shape,
    position: [...defaults.position],
    scale: [...defaults.scale],
    rotation: [0, 0, 0],
    color: DEFAULT_LIGHT_COLOR,
    intensity: defaults.intensity,
  };
}

/** Smallest clone offset in meters, so tiny lights still separate visibly. */
const MIN_CLONE_DISTANCE = 0.3;

/** Gap in meters left between a light and its clone, past the light's width. */
const CLONE_GAP = 0.2;

/**
 * Distance a clone is moved away from its source: `max(0.3, scale[0] + 0.2)`,
 * so wide box lights also clear their own footprint instead of
 * half-overlapping.
 */
export function cloneOffsetDistance(scale: Vec3): number {
  return Math.max(MIN_CLONE_DISTANCE, scale[0] + CLONE_GAP);
}

/**
 * Builds a copy of `source` with a fresh id and a small position offset
 * so the clone does not visually overlap the original.
 *
 * The offset is applied along the source's LOCAL +X axis (its rotation is
 * applied to the offset vector), so cloning a tilted light moves the
 * copy "to its right" relative to the light's own orientation, which feels
 * more natural than always offsetting by world +X.
 */
export function cloneUserLight(source: UserLight): UserLight {
  const distance = cloneOffsetDistance(source.scale);
  const offset = new THREE.Vector3(distance, 0, 0).applyEuler(
    new THREE.Euler(...source.rotation),
  );
  return {
    ...source,
    id: generateId(),
    position: [
      source.position[0] + offset.x,
      source.position[1] + offset.y,
      source.position[2] + offset.z,
    ],
  };
}

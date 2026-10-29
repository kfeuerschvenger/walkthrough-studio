import * as THREE from 'three';

/**
 * Renderer settings shared by the editor and the walkthrough, so the two
 * pages render the same scene the same way. Module-level constants keep
 * the prop identities stable across renders.
 */

/** Soft PCF shadows: the best quality/cost balance for a house interior. */
export const CANVAS_SHADOWS = { type: THREE.PCFShadowMap } as const;

/** Device pixel ratio range: sharp on HiDPI, capped to protect frame time. */
export const CANVAS_DPR: [number, number] = [1, 1.5];

/** Renderer options: antialiasing and filmic tone mapping for the sky. */
export const CANVAS_GL = {
  antialias: true,
  toneMapping: THREE.ACESFilmicToneMapping,
} as const;

/** Camera near and far planes in meters, shared by both pages. */
export const CAMERA_NEAR = 0.05;
export const CAMERA_FAR = 500;

/** Vertical field of view of the editor's orbit camera, in degrees. */
export const EDITOR_FOV = 55;

/** Vertical field of view of the first-person camera, in degrees. */
export const WALKTHROUGH_FOV = 85;

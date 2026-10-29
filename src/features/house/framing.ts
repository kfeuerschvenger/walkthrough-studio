import * as THREE from 'three';
import type { Vec3 } from '../../../shared/sceneTypes';

/**
 * Direction from the model toward the editor camera: up and to the front
 * right, so a first look shows a facade, the roof line, and the ground.
 */
export const EDITOR_VIEW_DIRECTION: Vec3 = [10, 7, 12];

/**
 * Slack around the model when framing it, as a multiplier of the distance
 * that would exactly fit its bounding sphere in the vertical field of view.
 */
export const FRAMING_PADDING = 1.15;

/** The farthest the orbit camera may travel, as a multiple of the framing distance. */
export const MAX_DISTANCE_FACTOR = 4;

/** Camera placement derived from a model's bounds. */
export type CameraFraming = {
  /** Where the camera starts. */
  position: Vec3;
  /** What the orbit controls look at: the middle of the model. */
  target: Vec3;
  /** How far the user may orbit away. */
  maxDistance: number;
};

/**
 * Computes where the editor camera should start so the whole model is in
 * view, whatever its size: the demo house and a large imported model both
 * land at a sensible distance instead of a hard-coded position.
 *
 * The camera sits on {@link EDITOR_VIEW_DIRECTION} at the distance where
 * the model's bounding sphere fits the vertical `fovDegrees`.
 */
export function frameBounds(box: THREE.Box3, fovDegrees: number): CameraFraming {
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 1);
  const distance =
    (radius / Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2)) * FRAMING_PADDING;
  const direction = new THREE.Vector3(...EDITOR_VIEW_DIRECTION).normalize();
  const position = center.clone().addScaledVector(direction, distance);
  return {
    position: [position.x, position.y, position.z],
    target: [center.x, center.y, center.z],
    maxDistance: distance * MAX_DISTANCE_FACTOR,
  };
}

/** Framing used until the model has loaded and its bounds are known. */
export const FALLBACK_FRAMING: CameraFraming = {
  position: [...EDITOR_VIEW_DIRECTION],
  target: [0, 1.5, 0],
  maxDistance: 60,
};

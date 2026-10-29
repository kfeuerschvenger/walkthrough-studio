import type { LightTransform, UserLight } from './userLightTypes';

/** Replaces the light with the given id by itself merged with `patch`. */
export function patchLight(
  lights: readonly UserLight[],
  id: string,
  patch: Partial<Omit<UserLight, 'id'>>,
): UserLight[] {
  return lights.map((light) => (light.id === id ? { ...light, ...patch } : light));
}

/** Rewrites the transform fields of one light, e.g. after a gizmo drag. */
export function transformLight(
  lights: readonly UserLight[],
  id: string,
  transform: LightTransform,
): UserLight[] {
  return patchLight(lights, id, transform);
}

/** Removes the light with the given id. */
export function removeLight(lights: readonly UserLight[], id: string): UserLight[] {
  return lights.filter((light) => light.id !== id);
}

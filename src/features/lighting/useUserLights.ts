import type { Dispatch, SetStateAction } from 'react';
import { useScene } from '../scene/useScene';
import type { UserLight } from './userLightTypes';

/**
 * Reads the user-placed lights slice from the shared scene context.
 *
 * Thin selector over the scene context: the underlying state and its
 * persistence live in `SceneProvider` (server-backed autosave), and this
 * hook gives consumers the `[lights, setLights]` pair.
 */
export function useUserLights(): [UserLight[], Dispatch<SetStateAction<UserLight[]>>] {
  const { lights, setLights } = useScene();
  return [lights, setLights];
}

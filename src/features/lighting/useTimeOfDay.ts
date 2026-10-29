import { useScene } from '../scene/useScene';

/**
 * Reads the hour-of-day slice from the shared scene context.
 *
 * Thin selector over the scene context: the underlying state and its
 * persistence live in `SceneProvider` (server-backed autosave), and this
 * hook gives consumers the `[hour, setHour]` pair without the rest of the
 * context.
 */
export function useTimeOfDay(): [number, (hour: number) => void] {
  const { hour, setHour } = useScene();
  return [hour, setHour];
}

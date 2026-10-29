import { useContext } from 'react';
import { SceneContext, type SceneContextValue } from './sceneContext';

/**
 * Reads the scene context. Throws if called outside `SceneProvider`:
 * that's a developer error, not a runtime case we recover from.
 */
export function useScene(): SceneContextValue {
  const value = useContext(SceneContext);
  if (!value) {
    throw new Error('useScene must be used inside <SceneProvider>');
  }
  return value;
}

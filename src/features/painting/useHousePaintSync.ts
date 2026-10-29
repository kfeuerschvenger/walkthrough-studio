import { useCallback, useEffect, useState } from 'react';
import type * as THREE from 'three';
import { applyBodyPaints, applyFacePaints } from './paintApply';
import { useScene } from '../scene/useScene';

/**
 * Keeps the house in sync with the persisted paints.
 *
 * Returns `onHouseReady` for `<House onReady>` and the loaded `houseRoot`.
 * Whenever the body paints, the face paints, the texture list, or the house
 * itself (a remount builds a new root) changes, the paints are replayed
 * onto the house. Nothing is applied before `isHydrated`, so the first
 * replay runs against the real texture URLs, not an empty list.
 *
 * `applyBodyPaints` and `applyFacePaints` serialize their own runs, so
 * firing them on every change without awaiting is safe.
 */
export function useHousePaintSync(): {
  houseRoot: THREE.Object3D | null;
  onHouseReady: (root: THREE.Object3D) => void;
} {
  const { bodies, faces, textures, isHydrated } = useScene();
  const [houseRoot, setHouseRoot] = useState<THREE.Object3D | null>(null);

  const onHouseReady = useCallback((root: THREE.Object3D) => {
    setHouseRoot(root);
  }, []);

  useEffect(() => {
    if (!houseRoot || !isHydrated) return;
    void applyBodyPaints(houseRoot, bodies, textures);
  }, [houseRoot, bodies, textures, isHydrated]);

  useEffect(() => {
    if (!houseRoot || !isHydrated) return;
    void applyFacePaints(houseRoot, faces, textures);
  }, [houseRoot, faces, textures, isHydrated]);

  return { houseRoot, onHouseReady };
}

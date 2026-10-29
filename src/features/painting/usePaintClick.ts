import { useCallback, useEffect, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type * as THREE from 'three';
import type { Mode } from './types';
import { findBodyName } from './paintApply';
import { currentTriToOriginal } from './faceManager';
import { retextureFacePaint, upsertBodyPaint, upsertFacePaint } from './paintOps';
import { useScene } from '../scene/useScene';

/**
 * Walks up the scene graph from a clicked object until it finds a
 * `userData.lightId`. Returns null when the click did not hit any light.
 */
export function findLightIdAt(obj: THREE.Object3D | null): string | null {
  let current = obj;
  while (current) {
    const id = current.userData?.lightId;
    if (typeof id === 'string') return id;
    current = current.parent;
  }
  return null;
}

type Options = {
  /** Texture currently chosen for painting, or `null` when none is. */
  selectedTextureId: string | null;
  /** Body or face painting. */
  mode: Mode;
  /** Whether the side panel is on the paint or the lights tab. */
  panelMode: 'paint' | 'lights';
  /** Selects (or, with `null`, deselects) a light. */
  onSelectLight: (id: string | null) => void;
};

/**
 * Click handler for the 3D scene in the editor. Routes a click to the
 * right action based on the panel mode and the object that was hit:
 *
 *  - lights mode → click selects (or deselects) a light
 *  - paint mode + body → paints the body
 *  - paint mode + face child mesh → re-paints that face
 *  - paint mode + raw triangle → flood-fills a new face
 *
 * The handler runs outside React's render cycle, so it cannot close over
 * the latest state directly. The values it needs are mirrored into refs,
 * which keeps its identity stable (the canvas never rebinds it) while it
 * always reads the freshest selection.
 */
export function usePaintClick({
  selectedTextureId,
  mode,
  panelMode,
  onSelectLight,
}: Options): (event: ThreeEvent<MouseEvent>) => void {
  const { setBodies, setFaces } = useScene();

  const selectedTextureIdRef = useRef(selectedTextureId);
  const modeRef = useRef(mode);
  const panelModeRef = useRef(panelMode);
  useEffect(() => {
    selectedTextureIdRef.current = selectedTextureId;
    modeRef.current = mode;
    panelModeRef.current = panelMode;
  }, [selectedTextureId, mode, panelMode]);

  return useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const obj = event.object;

      if (panelModeRef.current === 'lights') {
        event.stopPropagation();
        onSelectLight(findLightIdAt(obj));
        return;
      }

      const textureId = selectedTextureIdRef.current;
      if (!textureId) return;

      if (modeRef.current === 'body') {
        const bodyName = findBodyName(obj);
        if (!bodyName) return;
        event.stopPropagation();
        setBodies((prev) => upsertBodyPaint(prev, bodyName, textureId));
        return;
      }

      if (obj.userData?.isFace) {
        const bodyName = obj.userData.bodyName as string | undefined;
        const seedTriIndex = obj.userData.seedTriIndex as number | undefined;
        if (!bodyName || seedTriIndex == null) return;
        event.stopPropagation();
        setFaces((prev) => retextureFacePaint(prev, bodyName, seedTriIndex, textureId));
        return;
      }

      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const bodyName = findBodyName(mesh);
      if (!bodyName) return;
      const faceIndex = event.faceIndex;
      if (faceIndex == null) return;
      const originalTri = currentTriToOriginal(mesh, faceIndex);
      event.stopPropagation();
      setFaces((prev) => upsertFacePaint(prev, bodyName, originalTri, textureId));
    },
    [setBodies, setFaces, onSelectLight],
  );
}

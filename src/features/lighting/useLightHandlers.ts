import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  cloneUserLight,
  createUserLight,
  type LightShape,
  type LightTransform,
  type TransformMode,
  type UserLight,
} from './userLightTypes';
import { patchLight, removeLight, transformLight } from './lightListOps';

type Options = {
  lights: UserLight[];
  setLights: Dispatch<SetStateAction<UserLight[]>>;
  setSelectedLightId: Dispatch<SetStateAction<string | null>>;
  setTransformMode: (mode: TransformMode) => void;
  /** Switches the side panel to its lights tab. */
  showLightsPanel: () => void;
  /** True while the panel is on its lights tab. */
  lightsPanelActive: boolean;
};

/** Everything the lights panel and the gizmo can ask for. */
export type LightHandlers = {
  addLight: (shape: LightShape) => void;
  cloneLight: (id: string) => void;
  clearLights: () => void;
  deleteLight: (id: string) => void;
  transformLight: (id: string, transform: LightTransform) => void;
  changeColor: (id: string, color: string) => void;
  changeIntensity: (id: string, intensity: number) => void;
  /** Gizmo drag start/end, to suppress the deselect that follows a drag. */
  dragChange: (dragging: boolean) => void;
  /** Click on empty canvas: deselects the light, unless a drag just ended. */
  pointerMissed: () => void;
};

/**
 * Handlers for the light list and the gizmo, kept out of the editor page.
 *
 * Every state change goes through a pure helper in `lightListOps.ts` or
 * the factories in `userLightTypes.ts`; the hook only wires them to the
 * selection state. Setters are never called from inside another setter's
 * updater function: updaters must stay pure, and React may run them twice.
 */
export function useLightHandlers({
  lights,
  setLights,
  setSelectedLightId,
  setTransformMode,
  showLightsPanel,
  lightsPanelActive,
}: Options): LightHandlers {
  // True while the user is dragging a light's transform gizmo. The gizmo
  // lives outside R3F's event tree, so the trailing DOM click after a
  // drag reaches the canvas as a "miss", so without this guard it would
  // deselect the very light we just transformed.
  const isDraggingRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);

  // Read by `pointerMissed`, which the canvas keeps bound across renders.
  const lightsPanelActiveRef = useRef(lightsPanelActive);
  useEffect(() => {
    lightsPanelActiveRef.current = lightsPanelActive;
  }, [lightsPanelActive]);

  useEffect(
    () => () => {
      if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current);
    },
    [],
  );

  const addLight = useCallback(
    (shape: LightShape) => {
      const light = createUserLight(shape);
      setLights((prev) => [...prev, light]);
      showLightsPanel();
      setSelectedLightId(light.id);
    },
    [setLights, showLightsPanel, setSelectedLightId],
  );

  // Clone the source light, append it to the list, select the clone, and
  // force translate mode so the user can immediately drag it into place.
  const cloneLight = useCallback(
    (id: string) => {
      const source = lights.find((light) => light.id === id);
      if (!source) return;
      const clone = cloneUserLight(source);
      setLights((prev) => [...prev, clone]);
      setSelectedLightId(clone.id);
      setTransformMode('translate');
    },
    [lights, setLights, setSelectedLightId, setTransformMode],
  );

  const clearLights = useCallback(() => {
    setLights([]);
    setSelectedLightId(null);
  }, [setLights, setSelectedLightId]);

  const deleteLight = useCallback(
    (id: string) => {
      setLights((prev) => removeLight(prev, id));
      setSelectedLightId((current) => (current === id ? null : current));
    },
    [setLights, setSelectedLightId],
  );

  const handleTransform = useCallback(
    (id: string, transform: LightTransform) => {
      setLights((prev) => transformLight(prev, id, transform));
    },
    [setLights],
  );

  const changeColor = useCallback(
    (id: string, color: string) => {
      setLights((prev) => patchLight(prev, id, { color }));
    },
    [setLights],
  );

  const changeIntensity = useCallback(
    (id: string, intensity: number) => {
      setLights((prev) => patchLight(prev, id, { intensity }));
    },
    [setLights],
  );

  const dragChange = useCallback((dragging: boolean) => {
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    if (dragging) {
      isDraggingRef.current = true;
      return;
    }
    // Keep the flag up across the trailing `click` that R3F reports as
    // missed. `setTimeout(0)` runs after the click handler completes.
    releaseTimerRef.current = window.setTimeout(() => {
      isDraggingRef.current = false;
      releaseTimerRef.current = null;
    }, 0);
  }, []);

  const pointerMissed = useCallback(() => {
    if (isDraggingRef.current) return;
    if (lightsPanelActiveRef.current) setSelectedLightId(null);
  }, [setSelectedLightId]);

  return {
    addLight,
    cloneLight,
    clearLights,
    deleteLight,
    transformLight: handleTransform,
    changeColor,
    changeIntensity,
    dragChange,
    pointerMissed,
  };
}

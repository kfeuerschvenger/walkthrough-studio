import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';

import SceneLoader from '../components/atoms/SceneLoader';
import TimeSlider from '../components/molecules/TimeSlider';
import TexturePanel, {
  type PanelMode,
} from '../components/organisms/TexturePanel';

import House from '../features/house/House';
import {
  FALLBACK_FRAMING,
  frameBounds,
  type CameraFraming as Framing,
} from '../features/house/framing';
import CameraFraming from '../features/controls/CameraFraming';
import FusionControls from '../features/controls/FusionControls';
import SceneLighting from '../features/lighting/SceneLighting';
import UserLights from '../features/lighting/UserLights';
import { useTimeOfDay } from '../features/lighting/useTimeOfDay';
import { useLightHandlers } from '../features/lighting/useLightHandlers';
import { computeSun } from '../features/lighting/sun';
import type { TransformMode } from '../features/lighting/userLightTypes';

import type { Mode } from '../features/painting/types';
import { useHousePaintSync } from '../features/painting/useHousePaintSync';
import { usePaintClick } from '../features/painting/usePaintClick';
import {
  CAMERA_FAR,
  CAMERA_NEAR,
  CANVAS_DPR,
  CANVAS_GL,
  CANVAS_SHADOWS,
  EDITOR_FOV,
} from '../features/scene/canvasConfig';
import { useScene } from '../features/scene/useScene';

/** Closest the orbit camera may get to its target, in meters. */
const MIN_ORBIT_DISTANCE = 1.5;

/**
 * Highest polar angle of the orbit camera: just short of the horizon, so
 * the camera never dips under the ground plane.
 */
const MAX_ORBIT_POLAR_ANGLE = Math.PI * 0.495;

/** Camera settings before the model loads and its bounds can be framed. */
const EDITOR_CAMERA = {
  fov: EDITOR_FOV,
  near: CAMERA_NEAR,
  far: CAMERA_FAR,
  position: FALLBACK_FRAMING.position,
};

/**
 * Texture-tool page: the editor for body / face paints and user lights.
 *
 * All persisted state lives in the shared `SceneProvider`: paint maps,
 * lights, time of day, and uploaded textures. Local state here is purely
 * UI-side (currently-selected texture / light, panel mode, transform
 * mode) and is not autosaved. The click, light, and paint-replay logic
 * lives in hooks next to the features they belong to.
 */
export default function TextureToolPage() {
  const {
    textures,
    lights: userLights,
    setLights: setUserLights,
    uploadTextures,
    deleteTexture,
    updateTextureScale,
  } = useScene();

  const [selectedTextureId, setSelectedTextureId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('body');
  const [panelMode, setPanelMode] = useState<PanelMode>('paint');
  const [hour, setHour] = useTimeOfDay();
  const sun = useMemo(() => computeSun(hour), [hour]);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');

  const { houseRoot, onHouseReady } = useHousePaintSync();

  // Frame the camera on the loaded model so any house, large or small,
  // starts fully in view.
  const framing = useMemo<Framing>(
    () =>
      houseRoot
        ? frameBounds(new THREE.Box3().setFromObject(houseRoot), EDITOR_FOV)
        : FALLBACK_FRAMING,
    [houseRoot],
  );

  const showLightsPanel = useCallback(() => setPanelMode('lights'), []);
  const lights = useLightHandlers({
    lights: userLights,
    setLights: setUserLights,
    setSelectedLightId,
    setTransformMode,
    showLightsPanel,
    lightsPanelActive: panelMode === 'lights',
  });

  const handleSceneClick = usePaintClick({
    selectedTextureId,
    mode,
    panelMode,
    onSelectLight: setSelectedLightId,
  });

  // Global ESC: deselects whatever is selected (texture or light).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        setSelectedTextureId(null);
        setSelectedLightId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The texture is deselected only once the server confirmed the delete,
  // so a refused delete leaves the selection on a texture that still exists.
  const handleDeleteTexture = useCallback(
    async (id: string) => {
      const deleted = await deleteTexture(id);
      if (deleted) setSelectedTextureId((current) => (current === id ? null : current));
    },
    [deleteTexture],
  );

  const paintingActive = panelMode === 'paint' && selectedTextureId !== null;
  const selectedLight = userLights.find((light) => light.id === selectedLightId) ?? null;

  return (
    <div className={`tt-root ${paintingActive ? 'is-painting' : ''}`}>
      <div className="tt-viewport">
        <Canvas
          shadows={CANVAS_SHADOWS}
          dpr={CANVAS_DPR}
          gl={CANVAS_GL}
          camera={EDITOR_CAMERA}
          onPointerMissed={lights.pointerMissed}
        >
          <SceneLighting sun={sun} />
          <UserLights
            lights={userLights}
            dayness={sun.dayness}
            meshVisible={panelMode === 'lights'}
            editingId={panelMode === 'lights' ? selectedLightId : null}
            transformMode={transformMode}
            onTransform={lights.transformLight}
            onSelectLight={panelMode === 'lights' ? setSelectedLightId : undefined}
            onTransformDragChange={lights.dragChange}
          />

          <Suspense fallback={null}>
            <group onClick={handleSceneClick}>
              <House onReady={onHouseReady} />
            </group>
          </Suspense>

          <CameraFraming framing={framing} />
          <FusionControls
            makeDefault
            target={framing.target}
            maxDistance={framing.maxDistance}
            minDistance={MIN_ORBIT_DISTANCE}
            maxPolarAngle={MAX_ORBIT_POLAR_ANGLE}
          />
        </Canvas>
      </div>

      <TexturePanel
        textures={textures}
        selectedTextureId={selectedTextureId}
        mode={mode}
        userLightCount={userLights.length}
        panelMode={panelMode}
        userLights={userLights}
        selectedLight={selectedLight}
        transformMode={transformMode}
        onLoadFiles={uploadTextures}
        onSelectTexture={setSelectedTextureId}
        onDeleteTexture={handleDeleteTexture}
        onChangeMode={setMode}
        onChangeScale={updateTextureScale}
        onAddLight={lights.addLight}
        onCloneLight={lights.cloneLight}
        onClearLights={lights.clearLights}
        onChangePanelMode={setPanelMode}
        onSelectLight={setSelectedLightId}
        onChangeTransformMode={setTransformMode}
        onChangeLightColor={lights.changeColor}
        onChangeLightIntensity={lights.changeIntensity}
        onDeleteLight={lights.deleteLight}
      />

      <TimeSlider hour={hour} onChange={setHour} />
      <SceneLoader />
    </div>
  );
}

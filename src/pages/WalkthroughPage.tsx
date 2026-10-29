import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';

import Crosshair from '../components/atoms/Crosshair';
import Hud from '../components/atoms/Hud';
import SceneLoader from '../components/atoms/SceneLoader';
import TimeSlider from '../components/molecules/TimeSlider';
import Instructions from '../components/organisms/Instructions';

import House from '../features/house/House';
import FpsControls from '../features/fps/FpsControls';
import { requestCanvasPointerLock } from '../features/fps/pointerLock';
import SceneLighting from '../features/lighting/SceneLighting';
import UserLights from '../features/lighting/UserLights';
import { useTimeOfDay } from '../features/lighting/useTimeOfDay';
import { useUserLights } from '../features/lighting/useUserLights';
import { computeSun } from '../features/lighting/sun';
import { HOUR_KEY_STEP_HOURS, clampHour } from '../features/lighting/timeOfDay';
import { useHousePaintSync } from '../features/painting/useHousePaintSync';
import {
  CAMERA_FAR,
  CAMERA_NEAR,
  CANVAS_DPR,
  CANVAS_GL,
  CANVAS_SHADOWS,
  WALKTHROUGH_FOV,
} from '../features/scene/canvasConfig';
import { HOUSE_SPAWN } from '../features/house/houseConfig';

/** Eye height of the first-person camera, in meters. Matches `FpsControls`. */
const EYE_HEIGHT = 1.7;

/** First-person camera, placed at the configured spawn at eye height. */
const WALKTHROUGH_CAMERA = {
  fov: WALKTHROUGH_FOV,
  near: CAMERA_NEAR,
  far: CAMERA_FAR,
  position: [HOUSE_SPAWN[0], EYE_HEIGHT, HOUSE_SPAWN[1]] as [number, number, number],
};

/** Side length in meters and cell count of the debug grid (the `G` key). */
const GRID_SIZE = 40;
const GRID_DIVISIONS = 40;

/** Length in meters of the debug axes (the `H` key). */
const AXES_LENGTH = 3;

/**
 * Walkthrough page: first-person navigation of the house.
 *
 * Reads the persisted scene from `SceneProvider` (server-backed) and
 * replays the paint state onto the house every time either the scene
 * or the house remounts. The time-of-day slider is visible only while
 * the pointer is unlocked; during exploration the HUD shows the same
 * controls inline.
 */
export default function WalkthroughPage() {
  const [locked, setLocked] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showAxes, setShowAxes] = useState(false);
  const [hour, setHour] = useTimeOfDay();
  const sun = useMemo(() => computeSun(hour), [hour]);
  const [userLights] = useUserLights();
  const { onHouseReady } = useHousePaintSync();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const requestLock = useCallback(() => {
    requestCanvasPointerLock(canvasRef.current);
  }, []);

  // Global keyboard shortcuts for the walkthrough:
  //   G: toggle grid helper
  //   H: toggle axes helper
  //   [: decrease hour by 30 minutes
  //   ]: increase hour by 30 minutes
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === 'KeyG') setShowGrid((value) => !value);
      else if (event.code === 'KeyH') setShowAxes((value) => !value);
      else if (event.code === 'BracketLeft') setHour(clampHour(hour - HOUR_KEY_STEP_HOURS));
      else if (event.code === 'BracketRight') setHour(clampHour(hour + HOUR_KEY_STEP_HOURS));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hour, setHour]);

  return (
    <div className="walkthrough">
      <Canvas
        shadows={CANVAS_SHADOWS}
        dpr={CANVAS_DPR}
        gl={CANVAS_GL}
        camera={WALKTHROUGH_CAMERA}
        onCreated={({ gl }) => {
          canvasRef.current = gl.domElement;
        }}
      >
        <SceneLighting sun={sun} />
        <UserLights lights={userLights} dayness={sun.dayness} meshVisible={false} />

        {showGrid && (
          <gridHelper args={[GRID_SIZE, GRID_DIVISIONS, '#f99a1c', '#3a3a3a']} />
        )}
        {showAxes && <axesHelper args={[AXES_LENGTH]} />}

        <Suspense fallback={null}>
          <House onReady={onHouseReady} />
        </Suspense>

        <FpsControls onLockChange={setLocked} />
      </Canvas>

      {locked && <Crosshair />}
      {locked && (
        <Hud>WASD · Shift correr · ↑↓ subir/bajar · [ ] hora · G grid · H ejes · Esc</Hud>
      )}
      {!locked && <TimeSlider hour={hour} onChange={setHour} />}
      <Instructions locked={locked} onRequestLock={requestLock} />
      <SceneLoader />
    </div>
  );
}

import { memo } from 'react';
import { DoubleSide } from 'three';
import BulbMaterial from './BulbMaterial';
import SpotLightDown from './SpotLightDown';
import { POINT_DECAY, POINT_DISTANCE } from './lightingConfig';
import type { UserLight } from './userLightTypes';

type Props = {
  light: UserLight;
  /** 1 at full night, 0 in daylight (see `nightness.ts`). */
  nightness: number;
  meshVisible: boolean;
};

/** Smallest width / height of a box light's rectangle, in meters. */
const MIN_AREA_LIGHT_SIZE = 0.01;

/**
 * Inner contents of a light group: the actual emitter (rectArea / point /
 * spot) plus an optional emissive visualization mesh used only in lights
 * mode.
 *
 * Wrapped in `React.memo`: the parent re-renders on every hour tick, but
 * `nightness` is constant outside dusk and dawn, so most ticks leave every
 * light group untouched.
 */
function LightContents({ light, nightness, meshVisible }: Props) {
  const intensity = nightness * light.intensity;

  if (light.shape === 'spot') {
    return (
      <>
        {meshVisible && (
          <mesh userData={{ lightId: light.id }}>
            {/*
              Open-ended cone: apex up, base open downward. Light comes
              out the wide end. Geometry is a unit cone; the wrapping
              group applies `light.scale` so the lamp head scales
              uniformly with the user's gizmo.
            */}
            <coneGeometry args={[1, 1, 24, 1, true]} />
            <BulbMaterial color={light.color} nightness={nightness} side={DoubleSide} />
          </mesh>
        )}
        <SpotLightDown color={light.color} intensity={intensity} />
      </>
    );
  }

  if (light.shape === 'box') {
    const [sx, , sz] = light.scale;
    return (
      <>
        {meshVisible && (
          <mesh userData={{ lightId: light.id }}>
            <boxGeometry args={[1, 1, 1]} />
            <BulbMaterial color={light.color} nightness={nightness} />
          </mesh>
        )}
        <rectAreaLight
          position={[0, 0.5, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          width={Math.max(sx, MIN_AREA_LIGHT_SIZE)}
          height={Math.max(sz, MIN_AREA_LIGHT_SIZE)}
          color={light.color}
          intensity={intensity}
        />
      </>
    );
  }

  return (
    <>
      {meshVisible && (
        <mesh userData={{ lightId: light.id }}>
          <sphereGeometry args={[1, 24, 16]} />
          <BulbMaterial color={light.color} nightness={nightness} />
        </mesh>
      )}
      {/*
        Point lights deliberately do NOT cast shadows. Each one would
        otherwise render a 6-face cube depth map per frame, and the cost
        scales linearly with the number of placed sphere lights. The
        editor prioritizes fluid placement over physically-correct
        omnidirectional shadows.
      */}
      <pointLight
        color={light.color}
        intensity={intensity}
        distance={POINT_DISTANCE}
        decay={POINT_DECAY}
      />
    </>
  );
}

export default memo(LightContents);

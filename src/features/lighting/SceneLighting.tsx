import { memo } from 'react';
import { Sky, Stars } from '@react-three/drei';
import { STARS_DAYNESS_THRESHOLD, type SunState } from './sun';
import {
  SHADOW_BIAS,
  SKY_RADIUS,
  STARS,
  SUN_SHADOW_EXTENT,
  SUN_SHADOW_FAR,
  SUN_SHADOW_INTENSITY_THRESHOLD,
  SUN_SHADOW_MAP_SIZE,
  SUN_SHADOW_NEAR,
  SUN_SHADOW_NORMAL_BIAS,
} from './lightingConfig';

type Props = {
  sun: SunState;
};

/**
 * Global lighting wired to the time-of-day clock.
 *
 * Takes a pre-computed `sun` so the parent memoizes once per hour change
 * and shares it with other consumers such as UserLights, which keeps
 * lighting coherent across the scene.
 *
 * The moon is a second directional light on the opposite hemisphere with
 * a cool-blue tint and no shadows. It kicks in only when the sun is below
 * the horizon, keeping the scene readable at night without breaking the
 * dark mood.
 *
 * Wrapped in `React.memo` because the parent page re-renders on every
 * user-light state change. The parent computes `sun` once per hour value,
 * so the reference is unchanged for every re-render within the same hour:
 * memo hits and the whole `<Sky>` + shadow-camera subtree skips re-render.
 * A new hour produces a new `SunState` and re-renders it, as intended.
 */
function SceneLighting({ sun }: Props) {
  const sunCastsShadow = sun.sunIntensity > SUN_SHADOW_INTENSITY_THRESHOLD;
  // Stars are mounted only at night so they don't waste a draw call
  // during the day, and to avoid a faint star fade-in being visible
  // against the bright Preetham sky around dusk.
  const showStars = sun.dayness < STARS_DAYNESS_THRESHOLD;
  return (
    <>
      <Sky distance={SKY_RADIUS} sunPosition={sun.sunPosition} />
      {showStars && (
        <Stars
          radius={STARS.radius}
          depth={STARS.depth}
          count={STARS.count}
          factor={STARS.factor}
          saturation={0}
          fade
          speed={STARS.speed}
        />
      )}

      <hemisphereLight
        color={sun.hemisphereSkyColor}
        groundColor={sun.hemisphereGroundColor}
        intensity={sun.hemisphereIntensity}
      />
      <ambientLight color={sun.ambientColor} intensity={sun.ambientIntensity} />
      <directionalLight
        castShadow={sunCastsShadow}
        position={sun.sunLightPosition}
        intensity={sun.sunIntensity}
        shadow-mapSize-width={SUN_SHADOW_MAP_SIZE}
        shadow-mapSize-height={SUN_SHADOW_MAP_SIZE}
        shadow-camera-near={SUN_SHADOW_NEAR}
        shadow-camera-far={SUN_SHADOW_FAR}
        shadow-camera-left={-SUN_SHADOW_EXTENT}
        shadow-camera-right={SUN_SHADOW_EXTENT}
        shadow-camera-top={SUN_SHADOW_EXTENT}
        shadow-camera-bottom={-SUN_SHADOW_EXTENT}
        shadow-bias={SHADOW_BIAS}
        shadow-normalBias={SUN_SHADOW_NORMAL_BIAS}
      />
      <directionalLight
        position={sun.moonLightPosition}
        intensity={sun.moonIntensity}
        color={sun.moonColor}
      />
    </>
  );
}

export default memo(SceneLighting);

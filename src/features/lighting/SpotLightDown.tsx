import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import {
  SHADOW_BIAS,
  SHADOW_INTENSITY_THRESHOLD,
  SPOT_ANGLE,
  SPOT_DECAY,
  SPOT_DISTANCE,
  SPOT_PENUMBRA,
  SPOT_SHADOW_MAP_SIZE,
  SPOT_SHADOW_NEAR,
} from './lightingConfig';

type Props = {
  color: string;
  intensity: number;
};

/**
 * Spotlight that emits along the local -Y axis (downward) using an
 * Object3D positioned at local `(0, -1, 0)` as its target.
 *
 * three.js requires the spotlight's `target` to be part of the scene
 * graph for its `matrixWorld` to update each frame. r3f's
 * `<object3D ref>` does that for us: it mounts as a child of the
 * current parent (the light's transform group), so its world position
 * tracks the group's rotation / position naturally.
 *
 * One `useEffect` is enough to wire `light.target` once; the assignment
 * is idempotent and survives re-renders as long as the refs stay
 * stable.
 */
export default function SpotLightDown({ color, intensity }: Props) {
  const lightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);

  useEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current;
    }
  }, []);

  return (
    <>
      <spotLight
        ref={lightRef}
        position={[0, 0, 0]}
        color={color}
        intensity={intensity}
        angle={SPOT_ANGLE}
        penumbra={SPOT_PENUMBRA}
        distance={SPOT_DISTANCE}
        decay={SPOT_DECAY}
        castShadow={intensity > SHADOW_INTENSITY_THRESHOLD}
        shadow-mapSize-width={SPOT_SHADOW_MAP_SIZE}
        shadow-mapSize-height={SPOT_SHADOW_MAP_SIZE}
        shadow-bias={SHADOW_BIAS}
        shadow-camera-near={SPOT_SHADOW_NEAR}
        shadow-camera-far={SPOT_DISTANCE}
      />
      <object3D ref={targetRef} position={[0, -1, 0]} />
    </>
  );
}

import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';

type Props = React.ComponentProps<typeof OrbitControls>;

/**
 * `OrbitControls` remapped to the Fusion 360 navigation scheme:
 *
 *   - MMB drag           → pan
 *   - Shift + MMB drag   → orbit
 *   - Mouse wheel        → zoom (direction inverted vs. browser default)
 *   - LMB / RMB          → disabled (LMB stays free for painting)
 *
 * We do NOT map `MIDDLE` to `ROTATE` when Shift is held. `OrbitControls`
 * already has Shift-inversion built in: when `MIDDLE` is set to `PAN`,
 * Shift+drag automatically swaps to `ROTATE`. Forcing that swap ourselves
 * inverted it twice and brought us back to `PAN`.
 */
export default function FusionControls(props: Props) {
  const ref = useRef<OrbitControlsImpl | null>(null);
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const controls = ref.current;
    if (!controls) return;
    const canvas = gl.domElement;

    const NONE = -1 as unknown as THREE.MOUSE;
    controls.mouseButtons = {
      LEFT: NONE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: NONE,
    };

    const onWheel = (event: WheelEvent) => {
      try {
        Object.defineProperty(event, 'deltaY', {
          value: -event.deltaY,
          configurable: true,
        });
      } catch {
        /* frozen events on some browsers: ignore */
      }
    };

    canvas.addEventListener('wheel', onWheel, { capture: true });
    return () => {
      canvas.removeEventListener('wheel', onWheel, true);
    };
  }, [gl]);

  return <OrbitControls ref={ref} {...props} />;
}

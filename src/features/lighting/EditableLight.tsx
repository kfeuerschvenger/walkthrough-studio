import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { TransformControls } from '@react-three/drei';
import type * as THREE from 'three';
import { ROTATION_SNAP_RAD } from './lightingConfig';
import type { LightTransform, TransformMode, UserLight } from './userLightTypes';

type Props = {
  light: UserLight;
  mode: TransformMode;
  /** Receives the final transform when a gizmo drag is released. */
  onTransform?: (id: string, transform: LightTransform) => void;
  /** Fires `true` when the gizmo grabs the pointer and `false` on release. */
  onDragChange?: (dragging: boolean) => void;
  children: ReactNode;
};

/**
 * Editing wrapper. We own one group and the gizmo attaches to it via ref.
 *
 * A `useEffect` seeds the group's transform from state on mount and keeps
 * it in sync whenever the stored light changes. During a gizmo drag, the gizmo
 * mutates the group directly and the final transform is committed to the
 * parent state once, on release.
 */
export default function EditableLight({
  light,
  mode,
  onTransform,
  onDragChange,
  children,
}: Props) {
  const [target, setTarget] = useState<THREE.Group | null>(null);
  const [shiftDown, setShiftDown] = useState(false);
  // True between the gizmo's `mouseDown` and `mouseUp`. While true, we
  // SKIP `onTransform` calls: the gizmo mutates the group's Object3D
  // directly so the scene stays visually correct, and we commit the
  // final transform to React state once on release. This eliminates the
  // 60 Hz panel re-renders that cause the editor to stutter during a
  // drag, especially with several lights placed.
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!target) return;
    target.position.set(...light.position);
    target.rotation.set(...light.rotation);
    target.scale.set(...light.scale);
  }, [target, light]);

  // Shift held → disable rotation snap so the user can dial in arbitrary
  // angles. Default is snap-to-5° because most placements want clean
  // alignments (45°, 90°, etc.).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftDown(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftDown(false);
    };
    // No `keyup` arrives when focus leaves the window or the tab is hidden
    // mid-press, so Shift would stay "held" and snapping stay disabled.
    const releaseShift = () => setShiftDown(false);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') releaseShift();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseShift);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseShift);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const commitFromTarget = useCallback(() => {
    if (!target || !onTransform) return;
    onTransform(light.id, {
      position: [target.position.x, target.position.y, target.position.z],
      rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
      scale: [target.scale.x, target.scale.y, target.scale.z],
    });
  }, [target, light.id, onTransform]);

  return (
    <>
      <group ref={setTarget} userData={{ lightId: light.id }}>
        {children}
      </group>
      {target && (
        <TransformControls
          object={target}
          mode={mode}
          rotationSnap={shiftDown ? null : ROTATION_SNAP_RAD}
          onMouseDown={() => {
            isDraggingRef.current = true;
            onDragChange?.(true);
          }}
          onMouseUp={() => {
            isDraggingRef.current = false;
            commitFromTarget();
            onDragChange?.(false);
          }}
          onObjectChange={() => {
            // No-op during a drag: `mouseUp` commits the final transform.
            // Changes made outside a drag are committed here immediately.
            if (isDraggingRef.current) return;
            commitFromTarget();
          }}
        />
      )}
    </>
  );
}

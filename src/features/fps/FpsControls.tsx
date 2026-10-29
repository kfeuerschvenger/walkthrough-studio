import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';

type FpsControlsProps = {
  /** Eye height in meters above the floor (default 1.7 m ≈ adult average). */
  eyeHeight?: number;
  /** Walking speed in m/s. */
  walkSpeed?: number;
  /** Sprint speed in m/s (held with Shift). */
  runSpeed?: number;
  /** Vertical fly speed in m/s for the noclip ascend/descend keys. */
  flySpeed?: number;
  /** Fires when the browser pointer-lock toggles. */
  onLockChange?: (locked: boolean) => void;
};

// Scratch vectors shared between frames so the per-frame loop allocates
// nothing. The values are overwritten every call to `useFrame`.
const FORWARD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const MOVE = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const YAW_EULER = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * First-person controls used by the walkthrough page.
 *
 * Movement is WASD planar (no gravity, no collisions: the model is small
 * enough that free flight is fine), Shift sprints, and the arrow keys
 * fly the camera up / down. Mouselook is handled by drei's
 * `PointerLockControls`, which means the user must click the canvas once
 * to grab the cursor before they can look around.
 */
export default function FpsControls({
  eyeHeight = 1.7,
  walkSpeed = 2.2,
  runSpeed = 5,
  flySpeed = 3,
  onLockChange,
}: FpsControlsProps) {
  // The camera is a mutable three.js object owned by the renderer, not
  // React state. Reading it through the store's `get` accessor at the point
  // of use (instead of holding it in a hook-returned binding) makes that
  // ownership explicit.
  const getState = useThree((state) => state.get);
  const keys = useRef<Record<string, boolean>>({});
  const heightRef = useRef(eyeHeight);

  // Force YXZ rotation order so yaw / pitch don't interact (otherwise
  // looking up while turning produces roll, which feels wrong in FPS).
  useEffect(() => {
    const { camera } = getState();
    camera.up.set(0, 1, 0);
    camera.rotation.order = 'YXZ';
  }, [getState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      keys.current[event.code] = true;
      if (
        event.code === 'ArrowUp' ||
        event.code === 'ArrowDown' ||
        event.code === 'ArrowLeft' ||
        event.code === 'ArrowRight'
      ) {
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.current[event.code] = false;
    };
    // A `keyup` is never delivered when focus leaves the window or the tab
    // is hidden mid-press, which would leave the key held forever.
    const releaseAll = () => {
      keys.current = {};
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') releaseAll();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // drei binds these to the controls' `lock` / `unlock` events as soon as it
  // creates them, so no event can slip by before a ref is populated.
  // Releasing the pointer (Escape) also drops every held key: the keyup can
  // land outside the locked canvas.
  const handleLock = useCallback(() => onLockChange?.(true), [onLockChange]);
  const handleUnlock = useCallback(() => {
    keys.current = {};
    onLockChange?.(false);
  }, [onLockChange]);

  useFrame(({ camera }, delta) => {
    const keymap = keys.current;
    const speed = keymap['ShiftLeft'] || keymap['ShiftRight'] ? runSpeed : walkSpeed;

    camera.getWorldDirection(FORWARD);
    FORWARD.y = 0;
    if (FORWARD.lengthSq() < 1e-4) {
      // Looking straight up/down: forward collapses to zero, so recover by
      // rebuilding it from the yaw component alone.
      YAW_EULER.set(0, camera.rotation.y, 0, 'YXZ');
      FORWARD.set(0, 0, -1).applyEuler(YAW_EULER);
    }
    FORWARD.normalize();
    RIGHT.crossVectors(FORWARD, WORLD_UP).normalize();

    MOVE.set(0, 0, 0);
    if (keymap['KeyW']) MOVE.add(FORWARD);
    if (keymap['KeyS']) MOVE.sub(FORWARD);
    if (keymap['KeyD']) MOVE.add(RIGHT);
    if (keymap['KeyA']) MOVE.sub(RIGHT);

    if (MOVE.lengthSq() > 0) {
      MOVE.normalize().multiplyScalar(speed * delta);
      camera.position.x += MOVE.x;
      camera.position.z += MOVE.z;
    }

    if (keymap['ArrowUp']) heightRef.current += flySpeed * delta;
    if (keymap['ArrowDown']) heightRef.current -= flySpeed * delta;

    camera.position.y = heightRef.current;
  });

  return <PointerLockControls onLock={handleLock} onUnlock={handleUnlock} />;
}

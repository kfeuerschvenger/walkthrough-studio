import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { CameraFraming as Framing } from '../house/framing';

type Props = {
  framing: Framing;
};

/**
 * Moves the camera to the framing's starting position whenever the framing
 * changes (once the house model has loaded and its bounds are known).
 * Renders nothing. The orbit target comes from the same framing, passed to
 * `FusionControls` by the page.
 */
export default function CameraFraming({ framing }: Props) {
  // The camera is a mutable three.js object owned by the renderer, so it is
  // read through the store's `get` accessor at the point of use.
  const getState = useThree((state) => state.get);

  useEffect(() => {
    getState().camera.position.set(...framing.position);
  }, [getState, framing]);

  return null;
}

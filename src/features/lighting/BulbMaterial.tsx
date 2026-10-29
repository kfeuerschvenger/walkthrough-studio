import type { Side } from 'three';
import { BULB_EMISSIVE_INTENSITY, BULB_ROUGHNESS } from './lightingConfig';

type Props = {
  /** The light's color, used as the emissive glow. */
  color: string;
  /** 1 at full night, 0 in daylight; scales the glow. */
  nightness: number;
  /** Face culling side. Open meshes (the spot cone) need `DoubleSide`. */
  side?: Side;
};

/**
 * Material of the visible bulb mesh drawn in lights mode: a white body
 * that glows in the light's color, brighter the darker it is. Shared by
 * every light shape so they stay visually identical.
 */
export default function BulbMaterial({ color, nightness, side }: Props) {
  return (
    <meshStandardMaterial
      color="#ffffff"
      emissive={color}
      emissiveIntensity={nightness * BULB_EMISSIVE_INTENSITY}
      roughness={BULB_ROUGHNESS}
      metalness={0}
      {...(side !== undefined ? { side } : {})}
    />
  );
}

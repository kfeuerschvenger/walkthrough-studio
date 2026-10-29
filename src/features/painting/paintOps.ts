import type { BodyPaint, FacePaint } from './paintTypes';

/**
 * Default angular tolerance for face flood-fills. The user clicks one
 * triangle; the flood expands to coplanar neighbors within ±N degrees.
 * 5° is tight enough to stop at material seams but loose enough to handle
 * mesh tessellation noise on flat surfaces.
 */
export const DEFAULT_FACE_TOLERANCE_DEG = 5;

/**
 * Sets the body's paint, replacing any earlier paint of the same body
 * (there is at most one per body). The new entry goes last.
 */
export function upsertBodyPaint(
  paints: readonly BodyPaint[],
  bodyName: string,
  textureId: string,
): BodyPaint[] {
  return [...paints.filter((paint) => paint.bodyName !== bodyName), { bodyName, textureId }];
}

/**
 * Re-textures an existing face paint in place, identified by
 * `(bodyName, seedTriIndex)`. Other paints are returned unchanged.
 */
export function retextureFacePaint(
  paints: readonly FacePaint[],
  bodyName: string,
  seedTriIndex: number,
  textureId: string,
): FacePaint[] {
  return paints.map((paint) =>
    paint.bodyName === bodyName && paint.seedTriIndex === seedTriIndex
      ? { ...paint, textureId }
      : paint,
  );
}

/**
 * Adds a face paint seeded at `seedTriIndex`, replacing any earlier paint
 * with the same `(bodyName, seedTriIndex)` identity. The new entry goes
 * last and uses {@link DEFAULT_FACE_TOLERANCE_DEG}.
 */
export function upsertFacePaint(
  paints: readonly FacePaint[],
  bodyName: string,
  seedTriIndex: number,
  textureId: string,
): FacePaint[] {
  return [
    ...paints.filter(
      (paint) => !(paint.bodyName === bodyName && paint.seedTriIndex === seedTriIndex),
    ),
    {
      bodyName,
      seedTriIndex,
      normalToleranceDeg: DEFAULT_FACE_TOLERANCE_DEG,
      textureId,
    },
  ];
}

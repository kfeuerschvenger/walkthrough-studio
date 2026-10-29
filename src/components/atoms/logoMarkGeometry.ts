/**
 * Path data of the brand mark on a 48x48 viewBox. Single source of truth:
 * `LogoMark` renders it, and `logoMarkGeometry.test.ts` checks that the
 * static SVG assets (favicon and `docs/assets/brand`) carry the same values.
 */
export const LOGO_MARK_GEOMETRY = {
  /** Two back and right edges of the house, drawn as steel outlines. */
  edges: ['M18 15.5 L36 6.5 L44 21 L26 30', 'M26 30 L44 21 V33 L26 42'],
  /** Front wall, filled orange. */
  wall: 'M10 33 L26 42 L26 30 L18 15.5 L10 21 Z',
} as const;

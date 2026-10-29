import { NIGHT_FADE_END, NIGHT_FADE_START } from './lightingConfig';

/**
 * Smoothstep easing, same shape as the GLSL built-in: 0 below `a`, 1 above
 * `b`, and a smooth S-curve in between.
 */
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How strongly user lights are powered, from `dayness` (see `sun.ts`):
 * 1 at night, 0 in daylight, with a smooth fade around dusk and dawn so
 * the transition is not a hard cut.
 */
export function nightnessFromDayness(dayness: number): number {
  return 1 - smoothstep(NIGHT_FADE_START, NIGHT_FADE_END, dayness);
}

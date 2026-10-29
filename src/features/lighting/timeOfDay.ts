/** Earliest hour of the clock: midnight. */
export const MIN_HOUR = 0;

/** Latest hour of the clock: the following midnight, same sun as `0`. */
export const MAX_HOUR = 24;

/** Granularity of the time-of-day slider, in hours (15 minutes). */
export const TIME_SLIDER_STEP_HOURS = 0.25;

/** How far the `[` and `]` keys move the clock, in hours (30 minutes). */
export const HOUR_KEY_STEP_HOURS = 0.5;

/** Default hour of a new scene: noon. */
export const DEFAULT_HOUR = 12;

/** Clamps an hour value into `[MIN_HOUR, MAX_HOUR]`. */
export function clampHour(hour: number): number {
  return Math.max(MIN_HOUR, Math.min(MAX_HOUR, hour));
}

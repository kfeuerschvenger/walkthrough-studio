/**
 * A model whose largest extent exceeds this value (in source units) is
 * assumed to be authored in millimeters. A house is never 10 km wide.
 */
export const MILLIMETER_MODEL_THRESHOLD = 10000;

/**
 * A model whose largest extent exceeds this value (and not the millimeter
 * threshold) is assumed to be authored in centimeters: no house is 100 m
 * wide.
 */
export const CENTIMETER_MODEL_THRESHOLD = 100;

/**
 * Guesses the factor that converts a model's source units to meters from
 * the largest extent of its bounding box.
 *
 * Returns `0.001` for millimeter models, `0.01` for centimeter models, and
 * `1` when the model already looks like it is in meters.
 */
export function unitScaleForDimension(maxDimension: number): number {
  if (maxDimension > MILLIMETER_MODEL_THRESHOLD) return 0.001;
  if (maxDimension > CENTIMETER_MODEL_THRESHOLD) return 0.01;
  return 1;
}

import * as THREE from 'three';
import { SUN_PATH_ROTATION_RAD } from '../house/houseConfig';

/**
 * Precomputed lighting state derived from an hour-of-day value.
 *
 * Everything that depends on the position of the sun (directional light
 * vector, hemisphere tint, ambient mix, moon position, day/night ramp) is
 * computed once per hour change and shared with every consumer in the
 * scene through this single object. Keeps the work cheap and the visuals
 * coherent across `SceneLighting` and `UserLights`.
 */
export type SunState = {
  /** Far-away sun vector, feeds `<Sky sunPosition>`. */
  sunPosition: [number, number, number];
  /** Near-distance sun vector, feeds the main `DirectionalLight`. */
  sunLightPosition: [number, number, number];
  /** Multiplier for the main directional light. 0 means below the horizon. */
  sunIntensity: number;
  /** 0 at night, 1 at noon, drives all day↔night lerps. */
  dayness: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  hemisphereSkyColor: THREE.Color;
  hemisphereGroundColor: THREE.Color;
  hemisphereIntensity: number;
  /** Near-distance moon vector, feeds the moon's `DirectionalLight`. */
  moonLightPosition: [number, number, number];
  /** Soft fill-light intensity for when the sun is below the horizon. */
  moonIntensity: number;
  moonColor: THREE.Color;
};

/** Distance in scene units of the far-away sun vector that feeds `<Sky>`. */
const SKY_DIST = 100;

/**
 * Distance in scene units of the directional light vectors. Short enough
 * that the shadow frustum stays tight around the house.
 */
const LIGHT_DIST = 40;

/**
 * `dayness` below which the stars are shown. Also the point where the
 * night half of the lerps is nearly complete.
 */
export const STARS_DAYNESS_THRESHOLD = 0.15;

/**
 * Gain applied to the sun's height above the horizon to get `dayness`.
 * Above 1, so daytime saturates a little after sunrise and night does not
 * bleed into the late afternoon.
 */
const DAYNESS_GAIN = 2.2;

/** Peak intensity of the sun's directional light, reached at noon. */
const SUN_PEAK_INTENSITY = 2.4;

/** Peak intensity of the moon's fill light, reached around midnight. */
const MOON_PEAK_INTENSITY = 0.55;

/** Ambient light intensity at night, plus `AMBIENT_DAY_GAIN` at full day. */
const AMBIENT_NIGHT_INTENSITY = 0.12;
const AMBIENT_DAY_GAIN = 0.33;

/** Hemisphere light intensity at night, plus `HEMI_DAY_GAIN` at full day. */
const HEMI_NIGHT_INTENSITY = 0.25;
const HEMI_DAY_GAIN = 0.65;

// The sun arc is rotated around the world Y axis by `SUN_PATH_ROTATION_RAD`
// (see `houseConfig.ts`, set with `VITE_SUN_PATH_ROTATION_DEG`). The base
// arc rises at +X and sets at -X, an east-west line aligned with the world
// X axis, so a model whose facade faces another way needs an offset:
//  -   0 deg: sun rises at +X, sets at -X (default)
//  -  45 deg: sun rises at (+X, +Z), sets at (-X, -Z)
//  -  90 deg: sun rises at +Z, sets at -Z
//  - -45 deg: sun rises at (+X, -Z), sets at (-X, +Z)

const DAY_AMBIENT = new THREE.Color('#ffffff');
const NIGHT_AMBIENT = new THREE.Color('#2a3658');
const DAY_HEMI_SKY = new THREE.Color('#bde0ff');
const NIGHT_HEMI_SKY = new THREE.Color('#1a2540');
const DAY_HEMI_GROUND = new THREE.Color('#3a3328');
const NIGHT_HEMI_GROUND = new THREE.Color('#10141c');
const MOON_COLOR = new THREE.Color('#bcd2ff');

// `computeSun` is called from `useMemo`, so it must be pure: the lerped
// colors and the position arrays are allocated per call. Position arrays in
// particular have to be fresh, because r3f compares array props by
// REFERENCE before calling `.set(...)` on the target Object3D, so a reused
// array would freeze the Sky uniform and every directionalLight at their
// first-render position.

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Derives the full lighting state from an hour value in [0, 24].
 *
 * The sun follows a sinusoidal arc: above horizon between 6 and 18 (peak
 * at noon), below between 18 and 6 (mirrored). Azimuth sweeps east→west so
 * shadows visibly travel across the scene over the day.
 *
 * `dayness` is a non-linear remap of `sin(elevation)` that snaps quickly
 * around dawn / dusk, which keeps the night really dark and the day fully lit
 * with short transitions. Used as the t-value for every color/intensity
 * lerp downstream.
 */
export function computeSun(hour: number): SunState {
  const h = clamp(hour, 0, 24);

  // Elevation: +π/2 at noon (h=12), −π/2 at midnight.
  const elevation = Math.sin(((h - 6) / 12) * Math.PI) * (Math.PI / 2);
  // Azimuth: rotates around the vertical axis from sunrise to sunset.
  // The static `SUN_PATH_ROTATION_RAD` offset aligns the rise/set line
  // with the model's real-world east-west axis.
  const azimuth = ((h - 6) / 12) * Math.PI + SUN_PATH_ROTATION_RAD;

  const y = Math.sin(elevation);
  const x = Math.cos(elevation) * Math.cos(azimuth);
  const z = Math.cos(elevation) * Math.sin(azimuth);

  // Speed up the horizon transition so daytime saturates fast and night
  // doesn't bleed into the late afternoon.
  const dayness = clamp(y * DAYNESS_GAIN, 0, 1);
  const sunIntensity = clamp(y, 0, 1) * SUN_PEAK_INTENSITY;

  const ambientColor = new THREE.Color().lerpColors(NIGHT_AMBIENT, DAY_AMBIENT, dayness);
  const hemisphereSkyColor = new THREE.Color().lerpColors(NIGHT_HEMI_SKY, DAY_HEMI_SKY, dayness);
  const hemisphereGroundColor = new THREE.Color().lerpColors(
    NIGHT_HEMI_GROUND,
    DAY_HEMI_GROUND,
    dayness,
  );

  // Moon sits opposite to the sun. Intensity ramps up as the sun dips
  // below the horizon and peaks around midnight. No shadows are cast:
  // moonlight here is a soft directional fill, not a hard light source.
  const moonElevation = clamp(-y, 0, 1);
  const moonIntensity = moonElevation * MOON_PEAK_INTENSITY;

  return {
    sunPosition: [x * SKY_DIST, y * SKY_DIST, z * SKY_DIST],
    // Same direction as the sky vector, but at `LIGHT_DIST` so the
    // shadow frustum stays tight.
    sunLightPosition: [x * LIGHT_DIST, y * LIGHT_DIST, z * LIGHT_DIST],
    sunIntensity,
    dayness,
    ambientColor,
    ambientIntensity: AMBIENT_NIGHT_INTENSITY + dayness * AMBIENT_DAY_GAIN,
    hemisphereSkyColor,
    hemisphereGroundColor,
    hemisphereIntensity: HEMI_NIGHT_INTENSITY + dayness * HEMI_DAY_GAIN,
    moonLightPosition: [-x * LIGHT_DIST, -y * LIGHT_DIST, -z * LIGHT_DIST],
    moonIntensity,
    moonColor: MOON_COLOR,
  };
}

/** Formats an hour-of-day value as `HH:MM` (e.g. `13.5 → "13:30"`). */
export function formatHour(hour: number): string {
  const hours = Math.floor(hour);
  const minutes = Math.floor((hour - hours) * 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

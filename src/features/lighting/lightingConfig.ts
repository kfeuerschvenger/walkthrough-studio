/**
 * Tuning values for the scene's lights and their shadows. Collected in one
 * place so the sun in `SceneLighting` and the user lights in `UserLights`
 * stay consistent with each other.
 */

/**
 * Depth bias that fights shadow acne. Shared by the sun and the user
 * spotlights: it is tuned to the scene's geometry scale, not to an
 * individual light frustum.
 */
export const SHADOW_BIAS = -0.0005;

/* ---- Sun ---- */

/**
 * Below this `sunIntensity` the sun is essentially below the horizon and
 * its shadow map adds nothing visible, but the renderer still pays the
 * full depth pass every frame for it. Gating `castShadow` by this
 * threshold skips that pass for the entire night half of the cycle.
 */
export const SUN_SHADOW_INTENSITY_THRESHOLD = 0.05;

/** Resolution (texels per side) of the sun's shadow map. */
export const SUN_SHADOW_MAP_SIZE = 2048;

/** Near and far planes of the sun's shadow camera, in meters. */
export const SUN_SHADOW_NEAR = 0.5;
export const SUN_SHADOW_FAR = 120;

/**
 * Half-width in meters of the square the sun's shadow camera covers. Sized
 * to the house plus its yard: larger spreads the same texels thinner.
 */
export const SUN_SHADOW_EXTENT = 30;

/**
 * `normalBias` offsets shadow lookups along the surface normal rather than
 * the view depth. At noon the sun hits vertical walls edge-on, where depth
 * bias alone cannot avoid self-shadowing, which turns walls solid black.
 * 0.04 is small enough to avoid peter panning (shadows detaching from
 * their casters).
 */
export const SUN_SHADOW_NORMAL_BIAS = 0.04;

/** Radius in meters of the `<Sky>` dome. */
export const SKY_RADIUS = 450000;

/** Star field parameters, shown only at night. */
export const STARS = {
  radius: 150,
  depth: 50,
  count: 4000,
  factor: 4,
  speed: 0.4,
} as const;

/* ---- User lights ---- */

/** Half-angle of the spotlight cone in radians (~45 degrees, 90 full spread). */
export const SPOT_ANGLE = Math.PI / 4;
/** Softness of the cone edge (0 = hard, 1 = fully soft). */
export const SPOT_PENUMBRA = 0.3;
/** Falloff distance in meters before the spotlight reaches zero intensity. */
export const SPOT_DISTANCE = 15;
/** Physical decay exponent, matches sphere lights for consistency. */
export const SPOT_DECAY = 2;
/** Near plane in meters of a spotlight's shadow camera. */
export const SPOT_SHADOW_NEAR = 0.1;

/** Falloff distance in meters for point (sphere) lights. */
export const POINT_DISTANCE = 20;
/** Physical decay exponent for point lights. */
export const POINT_DECAY = 2;

/**
 * Shadow-map resolution for spotlights: one 2D map per light.
 *
 * 512 is the right tradeoff here: with N spotlights on at night, each one
 * rasterizes the whole house into its depth map per frame, so the cost
 * scales with the texel count. Fluid editing wins over crisp shadow edges.
 */
export const SPOT_SHADOW_MAP_SIZE = 512;

/**
 * Minimum effective intensity below which a spotlight skips shadow
 * rendering. The light is essentially off, so its shadow map adds nothing
 * visible while still costing a draw pass.
 */
export const SHADOW_INTENSITY_THRESHOLD = 0.01;

/**
 * Rotation snap of the transform gizmo in radians (5 degrees). Holding
 * Shift while rotating disables snapping.
 */
export const ROTATION_SNAP_RAD = (5 * Math.PI) / 180;

/**
 * `dayness` range over which user lights fade out at dawn and in at dusk.
 * Below `NIGHT_FADE_START` they are fully on; above `NIGHT_FADE_END` they
 * are off.
 */
export const NIGHT_FADE_START = 0.05;
export const NIGHT_FADE_END = 0.25;

/** Emissive intensity of a light's visible bulb mesh at full night. */
export const BULB_EMISSIVE_INTENSITY = 2.0;
/** Surface roughness of a light's visible bulb mesh. */
export const BULB_ROUGHNESS = 0.85;

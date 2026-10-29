/**
 * Domain types that cross the HTTP boundary.
 *
 * The browser and the Express server both import this module, so the JSON
 * the two sides exchange has exactly one definition. The file is types
 * only: it emits no runtime code and pulls in no dependency, which keeps it
 * safe to include from both the Vite and the Node TypeScript projects.
 */

/** A texture applied to a whole named body of the house model. */
export type BodyPaint = {
  bodyName: string;
  textureId: string;
};

/** A texture applied to one flood-filled face of a body. */
export type FacePaint = {
  bodyName: string;
  /** Index of the originally-clicked triangle in the body's geometry. */
  seedTriIndex: number;
  /** Angular tolerance for the flood-fill (in degrees). */
  normalToleranceDeg: number;
  textureId: string;
};

/**
 * Shape of a user-placed light source.
 *
 *  - `box`:    flat rectangular emitter (RectAreaLight under the hood).
 *  - `sphere`: small omni emitter (PointLight under the hood).
 *  - `spot`:   downward-projecting cone emitter (SpotLight). Direction is
 *              the light's local -Y, so rotating the light group tilts the
 *              cone.
 */
export type LightShape = 'box' | 'sphere' | 'spot';

/** Three numbers used for position, scale, and Euler rotation. */
export type Vec3 = [number, number, number];

/**
 * Transform fields of a user light, the part a gizmo drag rewrites.
 * Stored as plain arrays so the value stays JSON-serializable.
 */
export type LightTransform = {
  /** World position of the light's mesh center. */
  position: Vec3;
  /** Euler XYZ rotation in radians. */
  rotation: Vec3;
  /**
   * Per-axis scale (XYZ).
   *
   * - `box`:    used as the width / height of the area light's rectangle.
   * - `sphere`: only `scale[0]` is meaningful (radius of the visible bulb).
   * - `spot`:   scales the visualization cone uniformly; does NOT change
   *             the underlying SpotLight cone angle.
   */
  scale: Vec3;
};

/** A user-placed light source. */
export type UserLight = LightTransform & {
  id: string;
  shape: LightShape;
  /** Emissive + light color (CSS hex, e.g. `#ffd599`). */
  color: string;
  /** Peak intensity at full night. Multiplied by the night ramp at runtime. */
  intensity: number;
};

/**
 * Full scene document persisted as a single JSON file. Treating it as one
 * blob keeps the GET/PUT contract simple and atomic: every save is a
 * single write, every load is a single read.
 */
export type SceneDocument = {
  bodies: BodyPaint[];
  faces: FacePaint[];
  lights: UserLight[];
  /** Hour of day in [0, 24]. */
  hour: number;
};

/**
 * Texture metadata as stored in the server manifest. The image bytes live
 * next to it and are served by the binary texture endpoint; the client
 * derives the URL from `id`.
 */
export type TextureRecord = {
  id: string;
  filename: string;
  /** Tile size in world meters (1.0 = 1 m x 1 m before repeating). */
  scale: number;
  createdAt: number;
  mimeType: string;
};

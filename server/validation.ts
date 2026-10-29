import type {
  BodyPaint,
  FacePaint,
  LightShape,
  SceneState,
  UserLight,
} from './types.js';

/**
 * Hand-rolled validators for the HTTP boundary. The payloads are small
 * and fixed, so a schema library would add a runtime dependency for a
 * handful of checks.
 *
 * Every validator returns the first problem it finds as a short path
 * string such as `lights[3].position`, which the routes echo back in a
 * 400 response. Nothing here reads from the filesystem.
 */

/** Result of a validation pass: the typed value, or the first problem. */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Hard caps on collection sizes. Generous for a house, tiny for abuse. */
export const MAX_BODIES = 5000;
export const MAX_FACES = 5000;
export const MAX_LIGHTS = 200;

/** Longest accepted string for names and ids. */
const MAX_STRING = 256;

/** Texture ids are `randomUUID()` values, so anything else is rejected. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** CSS hex color: `#rgb`, `#rrggbb` or `#rrggbbaa`. */
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const LIGHT_SHAPES: readonly LightShape[] = ['box', 'sphere', 'spot'];

/** Returns true when `value` has the shape of a texture id (a UUID). */
export function isTextureId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Returns true for a finite number inside `[min, max]`. */
export function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, minLength = 1): value is string {
  return typeof value === 'string' && value.length >= minLength && value.length <= MAX_STRING;
}

function isVec3(value: unknown, limit: number): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => isNumberInRange(component, -limit, limit))
  );
}

function validateBody(entry: unknown): entry is BodyPaint {
  return (
    isRecord(entry) &&
    isBoundedString(entry.bodyName) &&
    isTextureId(entry.textureId)
  );
}

function validateFace(entry: unknown): entry is FacePaint {
  return (
    isRecord(entry) &&
    isBoundedString(entry.bodyName) &&
    typeof entry.seedTriIndex === 'number' &&
    Number.isInteger(entry.seedTriIndex) &&
    entry.seedTriIndex >= 0 &&
    entry.seedTriIndex <= 1e9 &&
    isNumberInRange(entry.normalToleranceDeg, 0, 180) &&
    isTextureId(entry.textureId)
  );
}

function validateLight(entry: unknown): entry is UserLight {
  return (
    isRecord(entry) &&
    isBoundedString(entry.id) &&
    typeof entry.shape === 'string' &&
    (LIGHT_SHAPES as readonly string[]).includes(entry.shape) &&
    isVec3(entry.position, 1e6) &&
    isVec3(entry.scale, 1e4) &&
    isVec3(entry.rotation, 1e3) &&
    typeof entry.color === 'string' &&
    HEX_COLOR_RE.test(entry.color) &&
    isNumberInRange(entry.intensity, 0, 1e4)
  );
}

/** Finds the index of the first entry that fails `check`, or -1. */
function firstInvalid(entries: unknown[], check: (entry: unknown) => boolean): number {
  return entries.findIndex((entry) => !check(entry));
}

/**
 * Validates a full scene document and returns a copy that contains only
 * the known fields, so unexpected keys never reach `scene.json`.
 */
export function validateScene(value: unknown): ValidationResult<SceneState> {
  if (!isRecord(value)) return { ok: false, error: 'scene must be an object' };

  const { bodies, faces, lights, hour } = value;
  if (!Array.isArray(bodies) || bodies.length > MAX_BODIES) {
    return { ok: false, error: `bodies must be an array of at most ${MAX_BODIES}` };
  }
  if (!Array.isArray(faces) || faces.length > MAX_FACES) {
    return { ok: false, error: `faces must be an array of at most ${MAX_FACES}` };
  }
  if (!Array.isArray(lights) || lights.length > MAX_LIGHTS) {
    return { ok: false, error: `lights must be an array of at most ${MAX_LIGHTS}` };
  }
  if (!isNumberInRange(hour, 0, 24)) {
    return { ok: false, error: 'hour must be a finite number between 0 and 24' };
  }

  const badBody = firstInvalid(bodies, validateBody);
  if (badBody !== -1) return { ok: false, error: `bodies[${badBody}] is invalid` };
  const badFace = firstInvalid(faces, validateFace);
  if (badFace !== -1) return { ok: false, error: `faces[${badFace}] is invalid` };
  const badLight = firstInvalid(lights, validateLight);
  if (badLight !== -1) return { ok: false, error: `lights[${badLight}] is invalid` };

  return {
    ok: true,
    value: {
      bodies: (bodies as BodyPaint[]).map((b) => ({
        bodyName: b.bodyName,
        textureId: b.textureId,
      })),
      faces: (faces as FacePaint[]).map((f) => ({
        bodyName: f.bodyName,
        seedTriIndex: f.seedTriIndex,
        normalToleranceDeg: f.normalToleranceDeg,
        textureId: f.textureId,
      })),
      lights: (lights as UserLight[]).map((l) => ({
        id: l.id,
        shape: l.shape,
        position: [...l.position],
        scale: [...l.scale],
        rotation: [...l.rotation],
        color: l.color,
        intensity: l.intensity,
      })),
      hour,
    },
  };
}

/** Range accepted for a texture's tile size in meters. */
export const SCALE_MIN = 0.01;
export const SCALE_MAX = 100;

/**
 * Validates the body of `PATCH /api/textures/:id`. Anything that is not a
 * JSON object, including a missing body (no `Content-Type`, or an empty
 * request), is rejected, as is a `scale` outside
 * `[SCALE_MIN, SCALE_MAX]`.
 */
export function validateScalePatch(body: unknown): ValidationResult<{ scale: number }> {
  if (!isRecord(body)) return { ok: false, error: 'body must be a JSON object' };
  const { scale } = body;
  if (!isNumberInRange(scale, SCALE_MIN, SCALE_MAX)) {
    return {
      ok: false,
      error: `scale must be a finite number between ${SCALE_MIN} and ${SCALE_MAX}`,
    };
  }
  return { ok: true, value: { scale } };
}

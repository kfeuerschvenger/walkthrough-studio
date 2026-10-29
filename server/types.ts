/**
 * Server-side domain types.
 *
 * The types that cross the HTTP boundary come from `shared/sceneTypes.ts`,
 * the single definition the browser also imports. This module re-exports
 * them under the names the server already uses and adds the server-only
 * pieces: the on-disk manifest shape and the default documents.
 */
import type {
  SceneDocument,
  TextureRecord,
} from '../shared/sceneTypes.js';

export type {
  BodyPaint,
  FacePaint,
  LightShape,
  SceneDocument,
  TextureRecord,
  UserLight,
} from '../shared/sceneTypes.js';

/** Alias of {@link SceneDocument}: the scene as persisted in `scene.json`. */
export type SceneState = SceneDocument;

/**
 * Empty scene used when no `scene.json` exists yet. Treat it as read-only:
 * spread it and replace the collections with fresh arrays, as the store does.
 */
export const DEFAULT_SCENE: SceneState = {
  bodies: [],
  faces: [],
  lights: [],
  hour: 12,
};

/** Shape of `textures/manifest.json`: a version stamp and the texture records. */
export type TextureManifest = {
  version: 1;
  textures: TextureRecord[];
};

/**
 * Manifest used when no `manifest.json` exists yet. Treat it as read-only:
 * spread it and replace `textures` with a fresh array, as the store does.
 */
export const EMPTY_MANIFEST: TextureManifest = {
  version: 1,
  textures: [],
};

/**
 * Domain types for the painting feature.
 *
 * `Texture` is the client view of an uploaded image: the server's
 * `TextureRecord` plus the `url` the renderer loads the bytes from.
 */

export type Texture = {
  id: string;
  filename: string;
  /** Server URL of the image bytes, derived from the texture id. */
  url: string;
  /** Tile size in world meters (1.0 means the texture covers a 1 m × 1 m patch). */
  scale: number;
};

/**
 * Painting interaction mode.
 *
 * - `body`: click anywhere on a body to paint the whole body.
 * - `face`: click a triangle to flood-fill a coplanar CAD face.
 */
export type Mode = 'body' | 'face';

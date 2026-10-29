import type { Texture } from '../painting/types';
import type { SceneDocument, TextureRecord } from '../../../shared/sceneTypes';

export type { SceneDocument, TextureRecord };

const API_BASE = '/api';

/**
 * Largest request body, in bytes, sent with `keepalive`. Browsers cap the
 * combined keepalive payload at 64 KiB, so this leaves headroom.
 */
const KEEPALIVE_MAX_BYTES = 60_000;

/** Largest texture file the server accepts, in MB. Mirrors the server's upload limit. */
export const MAX_UPLOAD_MB = 25;

/** MIME types the server accepts, in the format of a file input's `accept` attribute. */
export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

/** An HTTP failure from the API, carrying the response status. */
export class ApiError extends Error {
  /** HTTP status code of the failed response. */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Resolves the public URL of a texture blob. The browser fetches the
 * bytes through this URL. The response is cached `immutable` by the
 * server, so subsequent renders never re-download.
 */
export function textureUrl(id: string): string {
  return `${API_BASE}/textures/${encodeURIComponent(id)}`;
}

/**
 * Maps a server `TextureRecord` into the `Texture` shape the rest of
 * the frontend already consumes (just adds the URL derived from id).
 */
export function toTexture(record: TextureRecord): Texture {
  return {
    id: record.id,
    filename: record.filename,
    url: textureUrl(record.id),
    scale: record.scale,
  };
}

/** Fetches the full scene document on app start. */
export async function fetchScene(): Promise<SceneDocument> {
  const response = await fetch(`${API_BASE}/scene`);
  if (!response.ok) throw new Error(`fetchScene: ${response.status}`);
  return (await response.json()) as SceneDocument;
}

/**
 * Persists the scene document. Used by the debounced autosave: every
 * mutation in the SceneProvider eventually flows through this.
 *
 * With `keepalive` the browser lets the request outlive the page, which
 * is how the pending autosave is flushed on unload. `sendBeacon` cannot
 * do this job because it only issues POST and the endpoint is a PUT.
 * Browsers cap a keepalive body at 64 KiB; a larger scene is still sent,
 * but without the survive-unload guarantee. The cap applies to the encoded
 * size in bytes, which exceeds the string length for non-ASCII content.
 */
export async function saveScene(
  document: SceneDocument,
  options: { keepalive?: boolean } = {},
): Promise<void> {
  const body = JSON.stringify(document);
  const fitsKeepalive = new TextEncoder().encode(body).length < KEEPALIVE_MAX_BYTES;
  const response = await fetch(`${API_BASE}/scene`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: options.keepalive === true && fitsKeepalive,
  });
  if (!response.ok) throw new Error(`saveScene: ${response.status}`);
}

/** Returns the current list of texture records. */
export async function fetchTextures(): Promise<TextureRecord[]> {
  const response = await fetch(`${API_BASE}/textures`);
  if (!response.ok) throw new Error(`fetchTextures: ${response.status}`);
  return (await response.json()) as TextureRecord[];
}

/**
 * Uploads one file as a new texture. Server assigns the id; we get back
 * the canonical metadata for it. Rejects with an {@link ApiError} so the
 * caller can tell an oversize file (413) from an unsupported one (415).
 */
export async function uploadTexture(file: File): Promise<TextureRecord> {
  const formData = new FormData();
  formData.append('file', file, file.name);
  const response = await fetch(`${API_BASE}/textures`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) throw new ApiError(`uploadTexture: ${response.status}`, response.status);
  return (await response.json()) as TextureRecord;
}

/**
 * Patches editable metadata on an existing texture (today: just scale).
 * With `keepalive` the request outlives the page, which lets a pending
 * debounced patch go out while the page is being closed.
 */
export async function patchTextureScale(
  id: string,
  scale: number,
  options: { keepalive?: boolean } = {},
): Promise<TextureRecord> {
  const response = await fetch(`${API_BASE}/textures/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scale }),
    keepalive: options.keepalive === true,
  });
  if (!response.ok) throw new Error(`patchTextureScale: ${response.status}`);
  return (await response.json()) as TextureRecord;
}

/** Removes a texture and its underlying blob. */
export async function deleteTextureRequest(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/textures/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`deleteTexture: ${response.status}`);
}

/**
 * Image format allow-list and magic-byte sniffing for texture uploads.
 *
 * The client-supplied `Content-Type` and filename are never trusted: the
 * stored MIME type is derived from the file's leading bytes. SVG is
 * deliberately absent because it is an XML document that can carry
 * script, and a texture has no use for vector input.
 */

/** MIME types the server accepts and serves as textures. */
export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

/** Union of the MIME types in {@link ALLOWED_IMAGE_TYPES}. */
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Most bytes of an ISO `ftyp` box inspected for an AVIF brand. */
const FTYP_SCAN_LIMIT = 64;

/** Returns true when `value` is one of {@link ALLOWED_IMAGE_TYPES}. */
export function isAllowedImageType(value: string): value is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function ascii(buffer: Buffer, start: number, end: number): string {
  return buffer.toString('latin1', start, end);
}

/**
 * Detects the image format from the leading bytes of `buffer`. Returns
 * `null` when the content is not one of the allowed formats.
 */
export function sniffImageType(buffer: Buffer): AllowedImageType | null {
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (buffer.length >= 6) {
    const signature = ascii(buffer, 0, 6);
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif';
  }
  if (
    buffer.length >= 12 &&
    ascii(buffer, 0, 4) === 'RIFF' &&
    ascii(buffer, 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  // ISO base media file: a `ftyp` box whose major or compatible brands
  // include `avif` (still image) or `avis` (image sequence). A declared
  // size of 0 ("extends to the end of the file") or 1 ("a 64-bit size
  // follows") carries no usable length, so those scan the bounded window.
  if (buffer.length >= 16 && ascii(buffer, 4, 8) === 'ftyp') {
    const declared = buffer.readUInt32BE(0);
    const limit = declared <= 1 ? FTYP_SCAN_LIMIT : declared;
    const boxSize = Math.min(limit, buffer.length, FTYP_SCAN_LIMIT);
    const brands = ascii(buffer, 8, boxSize);
    if (brands.includes('avif') || brands.includes('avis')) return 'image/avif';
  }
  return null;
}

import { describe, expect, it } from 'vitest';
import { ALLOWED_IMAGE_TYPES, isAllowedImageType, sniffImageType } from '../imageType.js';

/** Builds an ISO base media `ftyp` box with the given brands. */
function ftyp(...brands: string[]): Buffer {
  const body = Buffer.from(`ftyp${brands.join('')}`, 'latin1');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(body.length + 4);
  return Buffer.concat([size, body, Buffer.alloc(8)]);
}

describe('sniffImageType', () => {
  it('detects PNG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(sniffImageType(png)).toBe('image/png');
  });

  it('detects JPEG', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe('image/jpeg');
  });

  it.each(['GIF87a', 'GIF89a'])('detects %s', (signature) => {
    expect(sniffImageType(Buffer.from(`${signature}\x01\x00\x01\x00`, 'latin1'))).toBe('image/gif');
  });

  it('detects WebP', () => {
    const webp = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.alloc(4),
      Buffer.from('WEBPVP8 ', 'latin1'),
    ]);
    expect(sniffImageType(webp)).toBe('image/webp');
  });

  it('does not take a RIFF container that is not WebP', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.alloc(4),
      Buffer.from('WAVEfmt ', 'latin1'),
    ]);
    expect(sniffImageType(wav)).toBeNull();
  });

  it.each(['avif', 'avis'])('detects AVIF by the %s brand', (brand) => {
    expect(sniffImageType(ftyp(brand, 'mif1'))).toBe('image/avif');
  });

  it('detects AVIF when the brand is only a compatible brand', () => {
    expect(sniffImageType(ftyp('mif1', '\0\0\0\0', 'avif'))).toBe('image/avif');
  });

  it.each([0, 1])('detects AVIF whose ftyp box declares the size %i', (declared) => {
    const box = ftyp('mif1', '\0\0\0\0', 'avif');
    box.writeUInt32BE(declared, 0);
    expect(sniffImageType(box)).toBe('image/avif');
  });

  it('rejects HEIC whose ftyp box declares the size 0', () => {
    const box = ftyp('heic', 'mif1');
    box.writeUInt32BE(0, 0);
    expect(sniffImageType(box)).toBeNull();
  });

  it('rejects other ISO media files such as HEIC', () => {
    expect(sniffImageType(ftyp('heic', 'mif1'))).toBeNull();
  });

  it('rejects SVG, even with a PNG-looking name or type upstream', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(sniffImageType(svg)).toBeNull();
  });

  it('rejects HTML and plain text', () => {
    expect(sniffImageType(Buffer.from('<!doctype html><html></html>'))).toBeNull();
    expect(sniffImageType(Buffer.from('hello world'))).toBeNull();
  });

  it('rejects truncated signatures and empty input', () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(Buffer.from('GIF8', 'latin1'))).toBeNull();
    expect(sniffImageType(Buffer.from('RIFF....WEB', 'latin1'))).toBeNull();
  });
});

describe('isAllowedImageType', () => {
  it.each(ALLOWED_IMAGE_TYPES)('allows %s', (type) => {
    expect(isAllowedImageType(type)).toBe(true);
  });

  it.each(['image/svg+xml', 'text/html', 'application/octet-stream', '', 'IMAGE/PNG'])(
    'rejects %j',
    (type) => {
      expect(isAllowedImageType(type)).toBe(false);
    },
  );
});

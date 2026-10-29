import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import multer from 'multer';
import {
  blobPath,
  deleteBlob,
  readManifest,
  updateManifest,
  writeBlob,
} from '../store.js';
import type { TextureRecord } from '../types.js';
import { isAllowedImageType, sniffImageType } from '../imageType.js';
import { isTextureId, validateScalePatch } from '../validation.js';

/** Max upload size per texture (25 MB, covers 4K PBR maps comfortably). */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Longest filename kept in the manifest. */
const MAX_FILENAME_LENGTH = 200;

/**
 * Multer with in-memory storage. We write blobs ourselves so the blob
 * write and the manifest update stay under our control: multer's disk
 * storage would write the file before the upload is validated.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  // Multer decodes header parameters such as the filename as latin1 unless
  // told otherwise, which turns `pared_año.jpg` into mojibake. Browsers send
  // the raw UTF-8 bytes.
  defParamCharset: 'utf8',
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

/**
 * Runs the multer parser and translates its failures into HTTP errors:
 * an oversize file is a 413, any other multer error is a client mistake
 * (400). Anything that is not a multer error goes to the central handler.
 */
function receiveFile(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'file too large' });
      } else {
        res.status(400).json({ error: 'invalid upload' });
      }
      return;
    }
    next(err);
  });
}

const router = Router();

// Every `:id` route validates the id before touching the manifest or the
// filesystem, so a path fragment never gets near `blobPath`.
router.param('id', (_req: Request, res: Response, next: NextFunction, id: string) => {
  if (!isTextureId(id)) {
    res.status(400).json({ error: 'invalid texture id' });
    return;
  }
  next();
});

/**
 * `GET /api/textures`
 *
 * Responds 200 with the array of texture records. A missing or corrupt
 * manifest yields an empty array.
 */
router.get('/', async (_req: Request, res: Response) => {
  const manifest = await readManifest();
  res.json(manifest.textures);
});

/**
 * `GET /api/textures/:id`
 *
 * Streams the texture bytes. Responds 200 with the stored image type and
 * hardened headers, 400 for a malformed id, and 404 when the id is not in
 * the manifest or its blob is missing.
 */
router.get('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const manifest = await readManifest();
  const record = manifest.textures.find((t) => t.id === id);
  if (!record) {
    res.status(404).end();
    return;
  }
  try {
    const data = await fs.readFile(blobPath(record.id));
    // Only allow-listed image types are served under their own MIME type.
    // Anything else (a stale manifest entry, say) degrades to an opaque
    // download that a browser will not render.
    const mimeType = isAllowedImageType(record.mimeType)
      ? record.mimeType
      : 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    // Texture bytes are immutable per id, so let the browser cache them.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(data);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).end();
      return;
    }
    throw err;
  }
});

/**
 * `POST /api/textures`
 *
 * Multipart upload with a single `file` field. Responds 201 with the new
 * {@link TextureRecord}, 400 when the file is missing or the multipart body
 * is malformed (wrong field name, more than one file), 413 above the size
 * limit, and 415 when the leading bytes are not an allowed image format.
 * The stored filename is the base name of the uploaded one, decoded as UTF-8.
 */
router.post('/', receiveFile, async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'missing file' });
    return;
  }

  // The declared type is a hint only; the bytes decide.
  const mimeType = sniffImageType(file.buffer);
  if (!mimeType) {
    res.status(415).json({ error: 'unsupported image type (png, jpeg, webp, gif, avif)' });
    return;
  }

  const id = randomUUID();
  const record: TextureRecord = {
    id,
    filename: path.basename(file.originalname).slice(0, MAX_FILENAME_LENGTH),
    scale: 1.0,
    createdAt: Date.now(),
    mimeType,
  };

  // Blob first, manifest second: a crash between the two leaves an
  // unreferenced blob rather than a manifest entry pointing at nothing.
  // When the manifest write fails in-process, the blob is removed again.
  await writeBlob(id, file.buffer);
  try {
    await updateManifest((current) => ({
      ...current,
      textures: [...current.textures, record],
    }));
  } catch (err) {
    await deleteBlob(id).catch(() => {});
    throw err;
  }

  res.status(201).json(record);
});

/**
 * `PATCH /api/textures/:id`
 *
 * Updates the tile size (`scale`, meters) of one texture. Responds 200 with
 * the updated record, 400 for a malformed id or a body that is not
 * `{ scale }` inside the accepted range, and 404 for an unknown id (the
 * manifest is not rewritten in that case).
 */
router.patch('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const parsed = validateScalePatch(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { scale } = parsed.value;

  // Returning `current` untouched for an unknown id skips the manifest
  // write entirely.
  const next = await updateManifest((current) => {
    if (!current.textures.some((t) => t.id === id)) return current;
    return {
      ...current,
      textures: current.textures.map((t) => (t.id === id ? { ...t, scale } : t)),
    };
  });

  const updated = next.textures.find((t) => t.id === id);
  if (!updated) {
    res.status(404).end();
    return;
  }
  res.json(updated);
});

/**
 * `DELETE /api/textures/:id`
 *
 * Removes the manifest entry and then the blob. Responds 204 whether or
 * not the texture existed (the call is idempotent) and 400 for a malformed
 * id.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  // Express 5 widens `req.params.id` to `string | string[]` because some
  // route patterns can repeat. Our `/:id` is a single segment, so narrow
  // it explicitly so the downstream calls type-check.
  const id = String(req.params.id);
  await updateManifest((current) => ({
    ...current,
    textures: current.textures.filter((t) => t.id !== id),
  }));
  await deleteBlob(id);
  res.status(204).end();
});

export default router;

import { Router, type Request, type Response } from 'express';
import { readScene, writeScene } from '../store.js';
import { validateScene } from '../validation.js';

const router = Router();

/**
 * `GET /api/scene`
 *
 * Responds 200 with the stored scene document. A missing or corrupt
 * `scene.json` yields the default empty scene, never an error. A storage
 * failure (for example an unreadable data directory) is a generic 500.
 */
router.get('/', async (_req: Request, res: Response) => {
  const scene = await readScene();
  res.json(scene);
});

/**
 * `PUT /api/scene`
 *
 * Replaces the whole scene document. Responds 204 with no body once the
 * write is durable, 400 with `invalid scene payload: <path>` when the body
 * fails validation (nothing is written), 413 when the body exceeds the JSON
 * limit, and a generic 500 on a storage failure.
 */
router.put('/', async (req: Request, res: Response) => {
  const parsed = validateScene(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: `invalid scene payload: ${parsed.error}` });
    return;
  }
  await writeScene(parsed.value);
  res.status(204).end();
});

export default router;

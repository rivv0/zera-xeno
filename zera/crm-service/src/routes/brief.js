import { Router } from 'express';
import * as ai from '../services/ai.js';

const router = Router();

// GET /api/brief
// Returns the in-memory cached Daily Brief. Reads the live module binding on
// each request so it always reflects the most recent generateDailyBrief() run.
router.get('/', (_req, res) => {
  const cache = ai.briefCache;

  if (cache.briefs.length === 0 && cache.error) {
    return res.json({ briefs: [], error: 'Brief unavailable' });
  }

  const payload = { briefs: cache.briefs, cached_at: cache.cached_at };
  if (cache.error) payload.error = cache.error;

  res.json(payload);
});

export default router;

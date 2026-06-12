import { Router } from 'express';
import { resolveNLSegment } from '../services/ai.js';
import { resolve, SegmentResolutionError } from '../services/segmentResolver.js';
import { pool } from '../index.js';

const router = Router();

router.post('/resolve', async (req, res) => {
  const { description } = req.body;

  // 1. Validate input
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return res.status(400).json({ error: 'description is required' });
  }
  if (description.length > 2000) {
    return res.status(400).json({ error: 'description must be 2000 characters or fewer' });
  }

  // 2. Call AI service to translate NL → Segment_Query
  let segmentQuery;
  try {
    segmentQuery = await resolveNLSegment(description);
  } catch (err) {
    if (err.code === 'PARSE_ERROR') {
      return res.status(502).json({ error: 'AI service returned an invalid response' });
    }
    if (err.code === 'SCHEMA_ERROR') {
      return res.status(400).json({
        error: err.message,
        unexpected_fields: err.extraFields,
      });
    }
    return res.status(502).json({ error: err.message });
  }

  // 3. Resolve segment query against the database
  let recipients;
  try {
    recipients = await resolve(segmentQuery, pool);
  } catch (err) {
    if (err instanceof SegmentResolutionError) {
      return res.status(422).json({ error: err.message });
    }
    throw err;
  }

  // 4. Return results
  return res.status(200).json({
    segment_query: segmentQuery,
    recipients,
    estimated_audience_size: recipients.length,
  });
});

export default router;

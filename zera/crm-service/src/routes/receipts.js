import { Router } from 'express';
import { pool } from '../index.js';
import { logEvent } from '../services/telemetry.js';

const router = Router();

const VALID_EVENT_TYPES = new Set(['sent', 'delivered', 'failed', 'opened', 'clicked']);
const TERMINAL_STATUSES = ['delivered', 'failed', 'opened', 'clicked'];

/**
 * POST /api/receipts
 * Accepts delivery event callbacks from channel-service and records them.
 *
 * Body: { comm_id: string, event_type: string, occurred_at: string (ISO 8601) }
 *
 * Responses:
 *   400 — missing comm_id or invalid event_type
 *   404 — comm_id not found in communications
 *   200 — processed (or idempotent duplicate)
 */
router.post('/', async (req, res) => {
  const { comm_id, event_type, occurred_at } = req.body;

  // --- Validation ---
  if (!comm_id || !event_type) {
    return res.status(400).json({ error: 'comm_id and event_type are required' });
  }

  if (!VALID_EVENT_TYPES.has(event_type)) {
    return res.status(400).json({
      error: `event_type must be one of: ${[...VALID_EVENT_TYPES].join(', ')}`,
    });
  }

  // --- Existence and Details check ---
  const existsResult = await pool.query(
    `SELECT comm.id, cust.name AS customer_name, camp.name AS campaign_name 
     FROM communications comm
     JOIN customers cust ON cust.id = comm.customer_id
     JOIN campaigns camp ON camp.id = comm.campaign_id
     WHERE comm.id = $1`,
    [comm_id]
  );
  if (existsResult.rowCount === 0) {
    return res.status(404).json({ error: `comm_id ${comm_id} not found` });
  }
  const commInfo = existsResult.rows[0];

  // --- Idempotency check ---
  const dupResult = await pool.query(
    'SELECT COUNT(*) FROM comm_events WHERE comm_id = $1 AND event_type = $2',
    [comm_id, event_type]
  );
  if (parseInt(dupResult.rows[0].count, 10) > 0) {
    return res.status(200).json({ status: 'duplicate', message: 'event already recorded' });
  }

  // --- Transactional write ---
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update communication status
    await client.query(
      'UPDATE communications SET status = $1, updated_at = NOW() WHERE id = $2',
      [event_type, comm_id]
    );

    // 2. Append comm_event audit row
    const eventTime = occurred_at || new Date().toISOString();
    await client.query(
      'INSERT INTO comm_events (comm_id, event_type, occurred_at) VALUES ($1, $2, $3)',
      [comm_id, event_type, eventTime]
    );

    // 3. Check campaign completion: all communications in terminal status
    const nonTerminal = await client.query(
      `SELECT COUNT(*) FROM communications 
       WHERE campaign_id = (SELECT campaign_id FROM communications WHERE id = $1)
       AND status NOT IN ('delivered', 'failed', 'opened', 'clicked')`,
      [comm_id]
    );
    const total = await client.query(
      `SELECT COUNT(*) FROM communications 
       WHERE campaign_id = (SELECT campaign_id FROM communications WHERE id = $1)`,
      [comm_id]
    );

    if (
      parseInt(nonTerminal.rows[0].count, 10) === 0 &&
      parseInt(total.rows[0].count, 10) > 0
    ) {
      await client.query(
        `UPDATE campaigns SET status = 'completed'
         WHERE id = (SELECT campaign_id FROM communications WHERE id = $1)`,
        [comm_id]
      );
    }

    await client.query('COMMIT');

    logEvent('RECEIPT', `Message to shopper ${commInfo.customer_name} for Campaign '${commInfo.campaign_name}' updated to status: ${event_type.toUpperCase()}.`, {
      comm_id,
      customer_name: commInfo.customer_name,
      campaign_name: commInfo.campaign_name,
      event_type
    });

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('receipts POST error:', err);
    return res.status(500).json({ error: 'internal server error' });
  } finally {
    client.release();
  }
});

export default router;

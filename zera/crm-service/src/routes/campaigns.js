import { Router } from 'express';
import { pool } from '../index.js';
import { resolve, SegmentResolutionError } from '../services/segmentResolver.js';
import { queue, DEFAULT_JOB_OPTIONS } from '../services/worker.js';
import { logEvent } from '../services/telemetry.js';

const router = Router();

const VALID_CHANNELS = ['email', 'sms', 'whatsapp'];

// GET /api/campaigns
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, channel, status, created_at 
       FROM campaigns 
       ORDER BY created_at DESC`
    );
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('[GET /api/campaigns] DB error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/campaigns
router.post('/', async (req, res) => {
  const { channel, message_template, segment_query, name } = req.body;

  // Validate channel
  if (!channel || !VALID_CHANNELS.includes(channel)) {
    return res.status(400).json({
      error: `Invalid channel. Must be one of: ${VALID_CHANNELS.join(', ')}.`,
    });
  }

  // Validate message_template
  if (!message_template || typeof message_template !== 'string' || message_template.trim() === '') {
    return res.status(400).json({
      error: 'message_template is required and must be a non-empty string.',
    });
  }

  const campaignName = name || `Campaign ${new Date().toISOString()}`;
  const segmentQuery = segment_query ?? {};

  try {
    const result = await pool.query(
      `INSERT INTO campaigns (name, segment_query, message_template, channel, status)
       VALUES ($1, $2, $3, $4, 'draft')
       RETURNING id`,
      [campaignName, JSON.stringify(segmentQuery), message_template, channel]
    );

    return res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[POST /api/campaigns] DB error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/campaigns/:id/launch
router.post('/:id/launch', async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Load Campaign by id → 404 if not found (lock row to prevent concurrent launches)
    const campaignResult = await client.query(
      `SELECT id, name, segment_query, message_template, channel FROM campaigns WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (campaignResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const campaign = campaignResult.rows[0];

    // 2. Resolve segment → array of { customer_id, name, sku_id, product_name }
    let recipients;
    try {
      recipients = await resolve(campaign.segment_query, client);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof SegmentResolutionError) {
        return res.status(422).json({ error: err.message });
      }
      throw err;
    }

    // 3. If array is empty: set status='completed', return 200 { launched: 0 }
    if (recipients.length === 0) {
      await client.query(
        `UPDATE campaigns SET status='completed' WHERE id = $1`,
        [id]
      );
      await client.query('COMMIT');
      logEvent('LAUNCH', `Campaign "${campaign.name}" resolved with an empty audience (0 shoppers). Status set to completed.`, { campaign_id: id });
      return res.status(200).json({ launched: 0 });
    }

    // 4. Render messages, skipping recipients with missing data
    const valid = [];
    for (const recipient of recipients) {
      if (!recipient.name || !recipient.product_name) {
        console.warn(
          `[launch] Skipping recipient customer_id=${recipient.customer_id}: missing name or product_name`
        );
        continue;
      }

      const message = campaign.message_template
        .replace(/\{name\}/g, recipient.name)
        .replace(/\{product\}/g, recipient.product_name);

      valid.push({ recipient, message });
    }

    // 5. Bulk-insert Communication records with status='queued'
    const comms = [];
    for (const { recipient, message } of valid) {
      const commResult = await client.query(
        `INSERT INTO communications (campaign_id, customer_id, channel, message, status)
         VALUES ($1, $2, $3, $4, 'queued')
         RETURNING id`,
        [id, recipient.customer_id, campaign.channel, message]
      );
      comms.push({ id: commResult.rows[0].id, recipient, message });
    }

    // 6. Write jobs payload to PostgreSQL outbox instead of enqueuing directly to Redis
    for (const { id: commId, recipient, message } of comms) {
      const payload = {
        commId,
        customerId: recipient.customer_id,
        channel: campaign.channel,
        message,
      };
      await client.query(
        `INSERT INTO outbox_events (payload) VALUES ($1)`,
        [JSON.stringify(payload)]
      );
    }

    // 7. Update campaign status to 'running'
    await client.query(
      `UPDATE campaigns SET status='running' WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    logEvent('LAUNCH', `Campaign "${campaign.name}" launched on channel '${campaign.channel}', writing ${comms.length} outbox event(s) to database.`, {
      campaign_id: id,
      campaign_name: campaign.name,
      channel: campaign.channel,
      audience_size: comms.length
    });

    return res.status(200).json({ launched: comms.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[POST /api/campaigns/${id}/launch] Error:`, err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// GET /api/campaigns/:id/stats
router.get('/:id/stats', async (req, res) => {
  const { id } = req.params;

  try {
    const campaignResult = await pool.query(
      'SELECT name, channel, message_template, status FROM campaigns WHERE id = $1',
      [id]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const campaign = campaignResult.rows[0];

    const countResult = await pool.query(
      `SELECT status, COUNT(*)::INTEGER as count 
       FROM communications 
       WHERE campaign_id = $1 
       GROUP BY status`,
      [id]
    );

    const commsResult = await pool.query(
      `SELECT
         comm.id AS id,
         comm.customer_id AS customer_id,
         cust.name AS customer_name,
         CASE 
           WHEN comm.channel = 'email' THEN cust.email
           ELSE cust.phone
         END AS customer_contact,
         comm.message,
         comm.status,
         comm.updated_at,
         COALESCE(
           (
             SELECT o.sku_id 
             FROM orders o
             JOIN product_profiles p ON p.sku_id = o.sku_id
             WHERE o.customer_id = comm.customer_id 
               AND comm.message ILIKE '%' || p.name || '%'
             ORDER BY o.ordered_at DESC 
             LIMIT 1
           ),
           (
             SELECT o2.sku_id 
             FROM orders o2 
             WHERE o2.customer_id = comm.customer_id 
             ORDER BY o2.ordered_at DESC 
             LIMIT 1
           )
         ) AS sku_id,
         COALESCE(
           (
             SELECT p.price
             FROM orders o
             JOIN product_profiles p ON p.sku_id = o.sku_id
             WHERE o.customer_id = comm.customer_id 
               AND comm.message ILIKE '%' || p.name || '%'
             ORDER BY o.ordered_at DESC 
             LIMIT 1
           ),
           10.00
         ) AS price
       FROM communications comm
       JOIN customers cust ON cust.id = comm.customer_id
       WHERE comm.campaign_id = $1
       ORDER BY comm.created_at ASC`,
      [id]
    );

    const stats = {
      queued: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      opened: 0,
      clicked: 0,
      campaign_status: campaign.status,
      campaign_name: campaign.name,
      channel: campaign.channel,
      message_template: campaign.message_template,
      communications: commsResult.rows,
    };

    for (const row of countResult.rows) {
      if (row.status in stats) {
        stats[row.status] = row.count;
      }
    }

    return res.status(200).json(stats);
  } catch (err) {
    console.error(`[GET /api/campaigns/${id}/stats] Error:`, err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;

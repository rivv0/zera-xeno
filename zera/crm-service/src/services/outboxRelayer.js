import { pool } from '../index.js';
import { queue, DEFAULT_JOB_OPTIONS } from './worker.js';
import { logEvent } from './telemetry.js';

let running = false;
let timeoutId = null;

const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 100;

/**
 * Polls the outbox_events table for pending dispatches and pushes them to BullMQ.
 */
async function processOutbox() {
  if (!running) return;

  try {
    // 1. Fetch a batch of pending events
    const result = await pool.query(
      `SELECT id, payload 
       FROM outbox_events 
       ORDER BY created_at ASC 
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (result.rows.length > 0) {
      logEvent('SYSTEM', `Outbox Relayer: Found ${result.rows.length} pending dispatch event(s). Processing...`, {
        batch_size: result.rows.length
      });

      // 2. Process each event sequentially or in parallel
      // Sequential deletion ensures we don't clear from outbox if enqueuing fails
      for (const event of result.rows) {
        const payload = event.payload;

        // Push to BullMQ Redis Queue
        await queue.add('send', payload, DEFAULT_JOB_OPTIONS);

        // Delete from PG outbox
        await pool.query('DELETE FROM outbox_events WHERE id = $1', [event.id]);
      }

      logEvent('SYSTEM', `Outbox Relayer: Successfully enqueued ${result.rows.length} job(s) to Redis and cleared outbox.`, {
        relayed_count: result.rows.length
      });
    }
  } catch (err) {
    console.error('[OutboxRelayer] Error processing outbox events:', err);
    logEvent('SYSTEM', `Outbox Relayer encounters issue: ${err.message || err.toString()}. Retrying...`);
  }

  // Schedule the next poll iteration
  if (running) {
    timeoutId = setTimeout(processOutbox, POLL_INTERVAL_MS);
  }
}

/**
 * Start the Outbox Relayer background worker loop
 */
export function start() {
  if (running) return;
  running = true;
  console.log('[OutboxRelayer] Starting outbox relayer loop...');
  timeoutId = setTimeout(processOutbox, POLL_INTERVAL_MS);
}

/**
 * Stop the Outbox Relayer background worker loop
 */
export function stop() {
  running = false;
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  console.log('[OutboxRelayer] Stopped outbox relayer loop.');
}

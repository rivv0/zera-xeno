import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';

import { pool } from '../index.js';
import { send } from './channelClient.js';

// ─── Redis connection ──────────────────────────────────────────────────────────

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // required by BullMQ
});

// ─── Default job options ───────────────────────────────────────────────────────

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000, // 1s → 2s → 4s
  },
};

// ─── Queue (exported for use in campaigns route) ───────────────────────────────

export const queue = new Queue('send-jobs', { connection });

// ─── Worker ───────────────────────────────────────────────────────────────────

export const worker = new Worker(
  'send-jobs',
  async (job) => {
    const { commId, customerId, channel, message } = job.data;

    const res = await send({ commId, channel, message });

    if (res.status !== 202) {
      throw new Error(`channel-service returned HTTP ${res.status} for commId=${commId}`);
    }

    // Mark Communication as sent and append audit event
    await pool.query(
      `UPDATE communications SET status='sent', updated_at=NOW() WHERE id=$1`,
      [commId],
    );

    await pool.query(
      `INSERT INTO comm_events (comm_id, event_type, occurred_at) VALUES ($1, 'sent', NOW())`,
      [commId],
    );
  },
  {
    connection,
    concurrency: 1,
  },
);

// ─── Failed event (fires after all retries are exhausted) ─────────────────────

worker.on('failed', async (job, err) => {
  if (!job) return;

  const { commId } = job.data;
  console.error(`[worker] Job ${job.id} for commId=${commId} failed after all attempts:`, err);

  try {
    await pool.query(
      `UPDATE communications SET status='failed', updated_at=NOW() WHERE id=$1`,
      [commId],
    );

    await pool.query(
      `INSERT INTO comm_events (comm_id, event_type, occurred_at) VALUES ($1, 'failed', NOW())`,
      [commId],
    );
  } catch (dbErr) {
    console.error(`[worker] failed to mark commId=${commId} as failed:`, dbErr.message);
  }
});

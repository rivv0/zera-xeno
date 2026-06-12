import { describe, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fc from 'fast-check';
import { app, pool } from '../src/index.js';

describe('Receipt Webhook Property Tests', () => {
  let customerId;
  let campaignId;
  let testCommIds = [];

  beforeAll(async () => {
    // Insert a dummy customer and campaign to use in tests
    const custRes = await pool.query(
      `INSERT INTO customers (name, email, channel_preference) 
       VALUES ('Test Shopper', 'test.shopper@example.com', 'email') 
       RETURNING id`
    );
    customerId = custRes.rows[0].id;

    const campRes = await pool.query(
      `INSERT INTO campaigns (name, message_template, channel, status) 
       VALUES ('Test Campaign', 'Hello {name}', 'email', 'running') 
       RETURNING id`
    );
    campaignId = campRes.rows[0].id;
  });

  afterAll(async () => {
    // Clean up
    await pool.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);
    await pool.query('DELETE FROM customers WHERE id = $1', [customerId]);
    await pool.end();
  });

  const validEvents = ['sent', 'delivered', 'failed', 'opened', 'clicked'];

  // Helper to create a communication
  async function createComm() {
    const res = await pool.query(
      `INSERT INTO communications (campaign_id, customer_id, channel, message, status) 
       VALUES ($1, $2, 'email', 'Hello Test', 'queued') 
       RETURNING id`,
      [campaignId, customerId]
    );
    const id = res.rows[0].id;
    testCommIds.push(id);
    return id;
  }

  // Feature: zera-crm, Property 12: Receipt updates status and appends audit event
  it('Property 12: Receipt updates status and appends audit event', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...validEvents),
        async (eventType) => {
          const commId = await createComm();
          const occurredAt = new Date().toISOString();

          const res = await request(app)
            .post('/api/receipts')
            .send({ comm_id: commId, event_type: eventType, occurred_at: occurredAt });

          // Expect 200 OK
          if (res.status !== 200) return false;

          // Check DB status
          const commRes = await pool.query('SELECT status FROM communications WHERE id = $1', [commId]);
          if (commRes.rows[0].status !== eventType) return false;

          // Check Event row
          const eventRes = await pool.query(
            'SELECT event_type FROM comm_events WHERE comm_id = $1 AND event_type = $2',
            [commId, eventType]
          );
          return eventRes.rows.length === 1;
        }
      ),
      { numRuns: 20 }
    );
  });

  // Feature: zera-crm, Property 14: Receipt returns 404 for unknown comm_id
  it('Property 14: Receipt returns 404 for unknown comm_id', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...validEvents),
        async (unknownId, eventType) => {
          const res = await request(app)
            .post('/api/receipts')
            .send({ comm_id: unknownId, event_type: eventType });

          if (res.status !== 404) return false;

          const eventRes = await pool.query('SELECT * FROM comm_events WHERE comm_id = $1', [unknownId]);
          return eventRes.rows.length === 0;
        }
      ),
      { numRuns: 20 }
    );
  });

  // Feature: zera-crm, Property 15: Receipt returns 400 for invalid event_type
  it('Property 15: Receipt returns 400 for invalid event_type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string().filter((s) => !validEvents.includes(s)),
        async (invalidEvent) => {
          const commId = await createComm();
          const res = await request(app)
            .post('/api/receipts')
            .send({ comm_id: commId, event_type: invalidEvent });

          if (res.status !== 400) return false;

          const eventRes = await pool.query('SELECT * FROM comm_events WHERE comm_id = $1', [commId]);
          return eventRes.rows.length === 0;
        }
      ),
      { numRuns: 20 }
    );
  });

  // Feature: zera-crm, Property 16: Receipt is idempotent for duplicate (comm_id, event_type)
  it('Property 16: Receipt is idempotent for duplicate (comm_id, event_type)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...validEvents),
        async (eventType) => {
          const commId = await createComm();

          // Post 1st time
          await request(app)
            .post('/api/receipts')
            .send({ comm_id: commId, event_type: eventType });

          // Post 2nd time
          const res = await request(app)
            .post('/api/receipts')
            .send({ comm_id: commId, event_type: eventType });

          if (res.status !== 200) return false;

          // Event count must still be exactly 1
          const eventRes = await pool.query(
            'SELECT COUNT(*)::INTEGER as count FROM comm_events WHERE comm_id = $1 AND event_type = $2',
            [commId, eventType]
          );
          return eventRes.rows[0].count === 1;
        }
      ),
      { numRuns: 20 }
    );
  });
});

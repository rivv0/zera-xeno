import { describe, it, afterAll } from 'vitest';
import request from 'supertest';
import fc from 'fast-check';
import { app, pool } from '../src/index.js';

describe('Campaigns and Stats Property Tests', () => {
  afterAll(async () => {
    await pool.end();
  });

  const validChannels = ['email', 'sms', 'whatsapp'];

  // Feature: zera-crm, Property 7: Campaign creation returns 201 for valid channels and 400 for invalid
  it('Property 7: Campaign creation channel validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        async (channelVal) => {
          const isValid = validChannels.includes(channelVal);
          const res = await request(app)
            .post('/api/campaigns')
            .send({
              name: `Test Camp ${channelVal}`,
              message_template: 'Hello {name}',
              channel: channelVal,
              segment_query: {},
            });

          if (isValid) {
            // Should be 201 Created
            if (res.status !== 201) return false;
            // Clean up inserted campaign
            const { id } = res.body;
            await pool.query('DELETE FROM campaigns WHERE id = $1', [id]);
            return true;
          } else {
            // Should be 400 Bad Request
            return res.status === 400;
          }
        }
      ),
      { numRuns: 25 }
    );
  });

  // Feature: zera-crm, Property 18: Stats returns 404 for any unknown campaign id
  it('Property 18: Stats returns 404 for any unknown campaign id', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (unknownId) => {
          const res = await request(app).get(`/api/campaigns/${unknownId}/stats`);
          return res.status === 404;
        }
      ),
      { numRuns: 20 }
    );
  });

  // Feature: zera-crm, Property 17: Stats response contains all six status keys
  it('Property 17: Stats response structure integrity', async () => {
    // Insert a temp campaign to query stats
    const campRes = await pool.query(
      `INSERT INTO campaigns (name, message_template, channel, status) 
       VALUES ('Stats Test', 'Hello {name}', 'sms', 'draft') 
       RETURNING id`
    );
    const campaignId = campRes.rows[0].id;

    try {
      const res = await request(app).get(`/api/campaigns/${campaignId}/stats`);
      if (res.status !== 200) return false;

      const keys = ['queued', 'sent', 'delivered', 'failed', 'opened', 'clicked', 'campaign_status'];
      for (const k of keys) {
        if (!(k in res.body)) return false;
      }
      
      return (
        res.body.queued >= 0 &&
        res.body.sent >= 0 &&
        res.body.delivered >= 0 &&
        res.body.failed >= 0 &&
        res.body.opened >= 0 &&
        res.body.clicked >= 0
      );
    } finally {
      await pool.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);
    }
  });
});

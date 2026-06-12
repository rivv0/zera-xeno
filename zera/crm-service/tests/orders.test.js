import { describe, it, afterAll, expect } from 'vitest';
import request from 'supertest';
import { app, pool } from '../src/index.js';

describe('Replenishment Ingestion & Learning API', () => {
  afterAll(async () => {
    // End the DB pool after tests complete
    await pool.end();
  });

  it('resets depletion dates and learns from repurchase cadence', async () => {
    // 1. Setup temporary customer
    const custRes = await pool.query(
      `INSERT INTO customers (name, email, channel_preference)
       VALUES ('Learning Test Buyer', 'learn.test@zeratest.in', 'email')
       RETURNING id`
    );
    const customerId = custRes.rows[0].id;

    // 2. Setup temporary product SKU with a 30-day consumption rate
    const skuRes = await pool.query(
      `INSERT INTO product_profiles (name, category, avg_consumption_days, price)
       VALUES ('Soap Concentrate Refill', 'cleaning', 30, 7.99)
       RETURNING sku_id`
    );
    const skuId = skuRes.rows[0].sku_id;

    try {
      // 3. Post a historical order (ordered 20 days ago)
      const historicalDate = new Date();
      historicalDate.setDate(historicalDate.getDate() - 20);

      await pool.query(
        `INSERT INTO orders (customer_id, sku_id, quantity, amount, ordered_at)
         VALUES ($1, $2, 1, 7.99, $3)`,
        [customerId, skuId, historicalDate]
      );

      // 4. Ingest a new order placed *today* (elapsed interval = 20 days)
      // Recalculation math:
      // old_avg = 30
      // elapsed = 20
      // blended = Math.round(30 * 0.8 + 20 * 0.2) = 28 days
      const res = await request(app)
        .post('/api/orders')
        .send({
          customer_id: customerId,
          sku_id: skuId,
          quantity: 1,
          amount: 7.99
        });

      // Verify response codes and return properties
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.learning_feedback).not.toBeNull();
      expect(res.body.learning_feedback.elapsed_days).toBe(20);
      expect(res.body.learning_feedback.old_avg).toBe(30);
      expect(res.body.learning_feedback.new_avg).toBe(28);

      // 5. Query the product profile to verify the change was persisted in the DB
      const dbCheck = await pool.query(
        'SELECT avg_consumption_days FROM product_profiles WHERE sku_id = $1',
        [skuId]
      );
      expect(dbCheck.rows[0].avg_consumption_days).toBe(28);

    } finally {
      // Cleanup testing rows
      await pool.query('DELETE FROM orders WHERE customer_id = $1', [customerId]);
      await pool.query('DELETE FROM product_profiles WHERE sku_id = $1', [skuId]);
      await pool.query('DELETE FROM customers WHERE id = $1', [customerId]);
    }
  });
});

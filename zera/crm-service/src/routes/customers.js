import { Router } from 'express';
import { pool } from '../index.js';

const router = Router();

// GET /api/customers - List all customers with search and channel filter
router.get('/', async (req, res) => {
  const { search, channel } = req.query;
  
  let query = `
    SELECT c.id, c.name, c.email, c.phone, c.channel_preference, c.created_at
    FROM customers c
  `;
  const params = [];
  const clauses = [];

  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(c.name ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.phone ILIKE $${params.length})`);
  }

  if (channel) {
    params.push(channel);
    clauses.push(`c.channel_preference = $${params.length}`);
  }

  if (clauses.length > 0) {
    query += ` WHERE ` + clauses.join(' AND ');
  }

  query += ` ORDER BY c.name ASC LIMIT 100`;

  try {
    const result = await pool.query(query, params);
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('[GET /api/customers] DB error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/customers/:id - Retrieve single customer with timeline and depletion forecasts
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Fetch profile
    const profileRes = await pool.query(
      `SELECT id, name, email, phone, channel_preference, created_at FROM customers WHERE id = $1`,
      [id]
    );

    if (profileRes.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const customer = profileRes.rows[0];

    // 2. Fetch order history
    const ordersRes = await pool.query(
      `SELECT o.id, o.quantity, o.amount, o.ordered_at, p.name AS product_name, p.avg_consumption_days
       FROM orders o
       JOIN product_profiles p ON p.sku_id = o.sku_id
       WHERE o.customer_id = $1
       ORDER BY o.ordered_at DESC`,
      [id]
    );

    // 3. Fetch communication touchpoints
    const commsRes = await pool.query(
      `SELECT comm.id, comm.channel, comm.message, comm.status, comm.created_at, camp.name AS campaign_name
       FROM communications comm
       JOIN campaigns camp ON camp.id = comm.campaign_id
       WHERE comm.customer_id = $1
       ORDER BY comm.created_at DESC`,
      [id]
    );

    // 4. Calculate predicted depletion forecasts
    const depletionRes = await pool.query(
      `SELECT
         o.sku_id,
         p.name AS product_name,
         o.ordered_at,
         p.avg_consumption_days,
         (o.ordered_at + (p.avg_consumption_days || ' days')::INTERVAL) AS predicted_depletes_at,
         EXTRACT(DAY FROM (o.ordered_at + (p.avg_consumption_days || ' days')::INTERVAL) - NOW())::INTEGER AS days_remaining
       FROM orders o
       JOIN product_profiles p ON p.sku_id = o.sku_id
       WHERE o.customer_id = $1
         AND o.ordered_at = (
           SELECT MAX(o2.ordered_at)
           FROM orders o2
           WHERE o2.customer_id = o.customer_id AND o2.sku_id = o.sku_id
         )
       ORDER BY days_remaining ASC`,
      [id]
    );

    return res.status(200).json({
      profile: customer,
      orders: ordersRes.rows,
      communications: commsRes.rows,
      depletion_forecasts: depletionRes.rows
    });

  } catch (err) {
    console.error(`[GET /api/customers/${id}] Error:`, err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;

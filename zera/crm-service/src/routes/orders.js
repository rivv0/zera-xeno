import { Router } from 'express';
import { pool } from '../index.js';
import { logEvent } from '../services/telemetry.js';

const router = Router();

// POST /api/orders
// Ingests a new order, resets the depletion timeline, and triggers the closed-loop replenishment learning logic.
router.post('/', async (req, res) => {
  const { customer_id, sku_id, quantity, amount, ordered_at } = req.body;

  // Validation
  if (!customer_id || !sku_id) {
    return res.status(400).json({ error: 'customer_id and sku_id are required.' });
  }

  const qty = parseInt(quantity, 10) || 1;
  const amt = parseFloat(amount);

  if (qty < 1) {
    return res.status(400).json({ error: 'quantity must be greater than or equal to 1.' });
  }

  if (isNaN(amt) || amt <= 0.0) {
    return res.status(400).json({ error: 'amount must be a positive number.' });
  }

  try {
    // 1. Verify customer exists
    const custCheck = await pool.query('SELECT id, name FROM customers WHERE id = $1', [customer_id]);
    if (custCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Customer not found.' });
    }
    const customerName = custCheck.rows[0].name;

    // 2. Verify SKU exists
    const skuCheck = await pool.query(
      'SELECT sku_id, name, avg_consumption_days FROM product_profiles WHERE sku_id = $1',
      [sku_id]
    );
    if (skuCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Product SKU not found.' });
    }
    const sku = skuCheck.rows[0];

    const orderTime = ordered_at ? new Date(ordered_at) : new Date();

    // 3. Find the previous order for this customer and SKU to calculate actual consumption interval
    const prevOrderRes = await pool.query(
      `SELECT ordered_at FROM orders 
       WHERE customer_id = $1 AND sku_id = $2 
       ORDER BY ordered_at DESC 
       LIMIT 1`,
      [customer_id, sku_id]
    );

    let learningFeedback = null;

    if (prevOrderRes.rows.length > 0) {
      const prevOrderTime = new Date(prevOrderRes.rows[0].ordered_at);
      const diffTime = Math.abs(orderTime - prevOrderTime);
      const elapsedDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (elapsedDays > 0) {
        const oldAvg = sku.avg_consumption_days;
        // Regenerative loop: Blend the new actual consumption interval into the SKU profiles
        // We use an Exponential Moving Average (80% historical, 20% fresh signal)
        const newAvg = Math.max(1, Math.round(oldAvg * 0.8 + elapsedDays * 0.2));

        if (newAvg !== oldAvg) {
          await pool.query(
            'UPDATE product_profiles SET avg_consumption_days = $1 WHERE sku_id = $2',
            [newAvg, sku_id]
          );
          learningFeedback = {
            message: `Updated SKU '${sku.name}' average consumption days from ${oldAvg} to ${newAvg} days based on actual shopper replacement interval of ${elapsedDays} days.`,
            elapsed_days: elapsedDays,
            old_avg: oldAvg,
            new_avg: newAvg
          };
          console.log(`[depletion-learning] ${learningFeedback.message}`);
        } else {
          learningFeedback = {
            message: `Shopper replacement interval was ${elapsedDays} days. SKU '${sku.name}' depletion rate remains stable at ${oldAvg} days.`,
            elapsed_days: elapsedDays,
            old_avg: oldAvg,
            new_avg: oldAvg
          };
        }
      }
    }

    // 4. Insert the new order
    const insertRes = await pool.query(
      `INSERT INTO orders (customer_id, sku_id, quantity, amount, ordered_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, ordered_at`,
      [customer_id, sku_id, qty, amt, orderTime]
    );

    // Log telemetry events
    logEvent('ORDER', `Shopper ${customerName} placed an order for '${sku.name}' ($${amt.toFixed(2)}).`, {
      customer_id,
      customer_name: customerName,
      sku_id,
      sku_name: sku.name,
      amount: amt
    });

    if (learningFeedback) {
      logEvent('LEARNING', learningFeedback.message, learningFeedback);
    }

    return res.status(201).json({
      success: true,
      order_id: insertRes.rows[0].id,
      ordered_at: insertRes.rows[0].ordered_at,
      learning_feedback: learningFeedback
    });

  } catch (err) {
    console.error('[POST /api/orders] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;

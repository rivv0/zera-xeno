import { Router } from 'express';
import { pool } from '../index.js';
import { logEvent, getEvents } from '../services/telemetry.js';
import { runDailyBrief } from '../index.js';

const router = Router();

// BASELINES map for D2C replenishment profiles
const BASELINES = {
  'Dish Soap Concentrate': 30,
  'Shampoo Bar': 60,
  'Floor Cleaner': 45,
  'Hand Wash': 25,
  'Surface Cleaner Pouch': 21,
  'Conditioner Bar': 50,
  'Bamboo Toothbrush': 90,
  'Body Wash Bar': 35,
  'Refill Concentrate': 55
};

// POST /api/simulator/fast-forward
// Subtracts N days from all order dates, communication dates, and event timestamps
// to simulate elapsed time, then updates the AI daily brief.
router.post('/fast-forward', async (req, res) => {
  const days = parseInt(req.body.days, 10);

  if (isNaN(days) || days <= 0) {
    return res.status(400).json({ error: 'days must be a positive integer.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Shift orders
    await client.query(
      `UPDATE orders SET ordered_at = ordered_at - ($1 || ' days')::INTERVAL`,
      [days]
    );

    // 2. Shift campaigns
    await client.query(
      `UPDATE campaigns SET created_at = created_at - ($1 || ' days')::INTERVAL`,
      [days]
    );

    // 3. Shift communications
    await client.query(
      `UPDATE communications 
       SET created_at = created_at - ($1 || ' days')::INTERVAL, 
           updated_at = updated_at - ($1 || ' days')::INTERVAL`,
      [days]
    );

    // 4. Shift comm events
    await client.query(
      `UPDATE comm_events SET occurred_at = occurred_at - ($1 || ' days')::INTERVAL`,
      [days]
    );

    await client.query('COMMIT');

    logEvent('CLOCK_SHIFT', `Fast-forwarded database clock by ${days} day(s). Timelines shifted.`, { days });

    // Regenerate daily briefs based on the new elapsed time
    // We execute this asynchronously so the response is fast
    setImmediate(async () => {
      try {
        await runDailyBrief();
        logEvent('SYSTEM', 'Recalculated predicted customer depletion schedules and refreshed AI Daily Briefs.');
      } catch (briefErr) {
        console.error('[Simulator] failed to runDailyBrief after clock shift:', briefErr.message);
      }
    });

    return res.status(200).json({
      success: true,
      message: `System successfully fast-forwarded by ${days} day(s).`
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /api/simulator/fast-forward] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error during timeline shift.' });
  } finally {
    client.release();
  }
});

// GET /api/simulator/telemetry
// Returns recent in-memory telemetry logs
router.get('/telemetry', (req, res) => {
  return res.status(200).json(getEvents());
});

// GET /api/simulator/analytics
// Computes direct CRM revenue attribution lift, on-time replenishments, and channel funnels
router.get('/analytics', async (req, res) => {
  try {
    // 1. Attribution & Revenue Lift
    const revQuery = `
      SELECT 
        (SELECT COALESCE(SUM(amount), 0)::NUMERIC(10,2) FROM orders) as total_revenue,
        (
          SELECT COALESCE(SUM(o.amount), 0)::NUMERIC(10,2)
          FROM orders o
          WHERE EXISTS (
            SELECT 1 
            FROM communications comm
            JOIN product_profiles p ON p.sku_id = o.sku_id
            WHERE comm.customer_id = o.customer_id
              AND comm.status IN ('delivered', 'opened', 'clicked')
              AND o.ordered_at >= comm.created_at 
              AND o.ordered_at <= comm.created_at + INTERVAL '7 days'
              AND comm.message ILIKE '%' || p.name || '%'
          )
        ) as attributed_revenue
    `;
    const revRes = await pool.query(revQuery);
    const totalRevenue = parseFloat(revRes.rows[0].total_revenue);
    const attributedRevenue = parseFloat(revRes.rows[0].attributed_revenue);
    const organicRevenue = totalRevenue - attributedRevenue;
    const liftPercentage = totalRevenue > 0 ? (attributedRevenue / totalRevenue) * 100 : 0.0;

    // 2. On-Time Replenishment Rate (Run-out Avoidance)
    const replenishmentQuery = `
      WITH order_intervals AS (
        SELECT 
          o.customer_id,
          o.sku_id,
          o.ordered_at,
          LAG(o.ordered_at) OVER (PARTITION BY o.customer_id, o.sku_id ORDER BY o.ordered_at ASC) as prev_ordered_at,
          p.avg_consumption_days
        FROM orders o
        JOIN product_profiles p ON p.sku_id = o.sku_id
      )
      SELECT 
        COUNT(*)::INTEGER as total_replenishments,
        SUM(CASE WHEN ordered_at - prev_ordered_at <= (avg_consumption_days || ' days')::INTERVAL THEN 1 ELSE 0 END)::INTEGER as on_time_replenishments
      FROM order_intervals
      WHERE prev_ordered_at IS NOT NULL
    `;
    const repRes = await pool.query(replenishmentQuery);
    const totalReplenishments = repRes.rows[0].total_replenishments || 0;
    const onTimeReplenishments = repRes.rows[0].on_time_replenishments || 0;
    const onTimeRate = totalReplenishments > 0 ? (onTimeReplenishments / totalReplenishments) * 100 : 100.0;

    // 3. Product Calibration updates (EMA vs Seed baseline)
    const prodRes = await pool.query(
      `SELECT sku_id, name, avg_consumption_days, price, category
       FROM product_profiles
       ORDER BY name ASC`
    );
    const productCalibrations = prodRes.rows.map(row => {
      const baseline = BASELINES[row.name] || row.avg_consumption_days;
      const diff = row.avg_consumption_days - baseline;
      let status = 'Stable';
      if (diff < 0) status = 'Accelerated';
      else if (diff > 0) status = 'Decelerated';

      return {
        sku_id: row.sku_id,
        name: row.name,
        category: row.category,
        price: parseFloat(row.price),
        avg_consumption_days: row.avg_consumption_days,
        baseline_days: baseline,
        variance_days: diff,
        status
      };
    });

    // 4. Channel Performance Funnels
    const channelSentRes = await pool.query(`
      SELECT 
        channel,
        COUNT(*)::INTEGER as sent,
        SUM(CASE WHEN status IN ('delivered', 'opened', 'clicked') THEN 1 ELSE 0 END)::INTEGER as delivered,
        SUM(CASE WHEN status IN ('opened', 'clicked') THEN 1 ELSE 0 END)::INTEGER as opened,
        SUM(CASE WHEN status = 'clicked' THEN 1 ELSE 0 END)::INTEGER as clicked
      FROM communications
      GROUP BY channel
    `);

    const channelAttributedRes = await pool.query(`
      SELECT 
        comm.channel,
        COUNT(DISTINCT o.id)::INTEGER as conversions,
        COALESCE(SUM(o.amount), 0)::NUMERIC(10,2) as revenue
      FROM orders o
      JOIN communications comm ON comm.customer_id = o.customer_id
      JOIN product_profiles p ON p.sku_id = o.sku_id
      WHERE comm.status IN ('delivered', 'opened', 'clicked')
        AND o.ordered_at >= comm.created_at 
        AND o.ordered_at <= comm.created_at + INTERVAL '7 days'
        AND comm.message ILIKE '%' || p.name || '%'
      GROUP BY comm.channel
    `);

    const channelStats = ['email', 'sms', 'whatsapp'].map(ch => {
      const sentRow = channelSentRes.rows.find(r => r.channel === ch) || { sent: 0, delivered: 0, opened: 0, clicked: 0 };
      const attRow = channelAttributedRes.rows.find(r => r.channel === ch) || { conversions: 0, revenue: 0 };

      return {
        channel: ch,
        sent: sentRow.sent,
        delivered: sentRow.delivered,
        opened: sentRow.opened,
        clicked: sentRow.clicked,
        conversions: attRow.conversions,
        revenue: parseFloat(attRow.revenue)
      };
    });

    return res.status(200).json({
      revenue: {
        total: totalRevenue,
        attributed: attributedRevenue,
        organic: organicRevenue,
        lift_percentage: liftPercentage
      },
      replenishment: {
        total: totalReplenishments,
        on_time: onTimeReplenishments,
        on_time_rate: onTimeRate
      },
      calibrations: productCalibrations,
      channels: channelStats
    });

  } catch (err) {
    console.error('[GET /api/simulator/analytics] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error during analytics processing.' });
  }
});

export default router;

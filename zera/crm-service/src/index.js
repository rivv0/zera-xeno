import express from 'express';
import pg from 'pg';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import path from 'path';

import campaignsRouter from './routes/campaigns.js';
import receiptsRouter from './routes/receipts.js';
import segmentsRouter from './routes/segments.js';
import briefRouter from './routes/brief.js';
import ordersRouter from './routes/orders.js';
import customersRouter from './routes/customers.js';
import { generateDailyBrief } from './services/ai.js';
import simulatorRouter from './routes/simulator.js';
import * as outboxRelayer from './services/outboxRelayer.js';

const { Pool } = pg;

// PostgreSQL connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Express app
const app = express();

app.use(express.json());

// Mount route files
app.use('/api/campaigns', campaignsRouter);
app.use('/api/receipts', receiptsRouter);
app.use('/api/segments', segmentsRouter);
app.use('/api/brief', briefRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/simulator', simulatorRouter);

// Serve frontend static assets in production
if (process.env.NODE_ENV === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendDist));
  // Fallback to React index.html for clientside routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ─── Depletion SQL ─────────────────────────────────────────────────────────────

const DEPLETION_SQL = `
SELECT
  c.id                                                        AS customer_id,
  c.name,
  c.email,
  c.channel_preference,
  o.sku_id,
  p.name                                                      AS product_name,
  o.ordered_at,
  p.avg_consumption_days,
  (o.ordered_at + (p.avg_consumption_days || ' days')::INTERVAL)
                                                              AS predicted_depletes_at,
  EXTRACT(DAY FROM
    (o.ordered_at + (p.avg_consumption_days || ' days')::INTERVAL) - NOW()
  )::INTEGER                                                  AS days_remaining
FROM orders o
JOIN customers c        ON c.id       = o.customer_id
JOIN product_profiles p ON p.sku_id   = o.sku_id
WHERE o.ordered_at = (
  SELECT MAX(o2.ordered_at)
  FROM   orders o2
  WHERE  o2.customer_id = o.customer_id
    AND  o2.sku_id      = o.sku_id
)
AND (o.ordered_at + (p.avg_consumption_days || ' days')::INTERVAL)
      BETWEEN NOW() AND NOW() + INTERVAL '7 days'
ORDER BY days_remaining ASC
`;

// ─── Daily Brief cron + immediate run on startup ───────────────────────────────

export async function runDailyBrief() {
  try {
    const result = await pool.query(DEPLETION_SQL);
    await generateDailyBrief(result.rows);
    console.log(`[cron] daily brief generated: ${result.rows.length} depletion rows`);
  } catch (err) {
    console.error('[cron] runDailyBrief failed:', err.message);
  }
}

cron.schedule('0 6 * * *', runDailyBrief);
runDailyBrief();

// ESM main-check: only listen when this file is the entry point
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
const PORT = process.env.PORT || 3000;

if (isMain) {
  app.listen(PORT, () => {
    console.log(`crm-service on port ${PORT}`);
    outboxRelayer.start();
  });
}

export { app };

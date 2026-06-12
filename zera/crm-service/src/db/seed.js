/**
 * Zera CRM — Seed Script
 * Populates the database with realistic D2C zero-waste brand data.
 *
 * Run: node src/db/seed.js
 *
 * Environment:
 *   DATABASE_URL  (default: postgresql://zera:zera@localhost:5432/zera_db)
 */

import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://zera:zera@localhost:5432/zera_db';

const pool = new Pool({ connectionString: DATABASE_URL });

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

// 75 realistic Indian D2C-customer names
const CUSTOMER_NAMES = [
  'Priya Sharma',      'Rohan Mehta',      'Ananya Singh',     'Arjun Kapoor',
  'Divya Nair',        'Vikram Iyer',      'Kavya Reddy',      'Aditya Patel',
  'Meera Krishnan',    'Siddharth Joshi',  'Pooja Desai',      'Rahul Gupta',
  'Shreya Verma',      'Karan Malhotra',   'Nisha Pillai',     'Aarav Kumar',
  'Tanvi Bose',        'Nikhil Rao',       'Sakshi Agarwal',   'Amit Chatterjee',
  'Riya Banerjee',     'Varun Saxena',     'Simran Kaur',      'Deepak Nambiar',
  'Anjali Murthy',     'Gaurav Sinha',     'Payal Mittal',     'Rajesh Choudhary',
  'Swati Menon',       'Manish Tripathi',  'Kriti Bhatt',      'Saurabh Pandey',
  'Aishwarya Kulkarni','Vishal Thakur',    'Nandini Hegde',    'Harsh Aggarwal',
  'Ishita Mishra',     'Tarun Shukla',     'Prachi Bhatia',    'Abhishek Tiwari',
  'Sunita Jain',       'Mohit Rawat',      'Aparna Nayak',     'Vinay Dubey',
  'Riddhi Shah',       'Akash Yadav',      'Megha Ghosh',      'Sandeep Rathi',
  'Usha Krishnamurthy','Ravi Shetty',      'Laleh Irani',      'Nitin Deshpande',
  'Sonam Chaturvedi',  'Prem Garg',        'Chitra Narayanan', 'Suresh Pillai',
  'Shalini Goswami',   'Mukesh Srivastava','Heena Vora',       'Dhruv Mathur',
  'Meenal Patil',      'Gopal Naik',       'Tamanna Oberoi',   'Ramesh Dixit',
  'Jayashree Mohan',   'Sameer Bajaj',     'Kavitha Suresh',   'Pranav Wagh',
  'Bindiya Misra',     'Uday Rajan',       'Shefali Sethi',    'Alok Bora',
  'Tejal Parikh',      'Chinmay Marathe',  'Lavanya Subramanian',
];

// channel_preference distribution: 26 whatsapp (~34.7%), 25 sms (~33.3%), 24 email (~32%)
// All ≥ 20% of 75 = 15. This distribution is well above the 20% floor.
const CHANNEL_PREFERENCES = [
  ...Array(26).fill('whatsapp'),
  ...Array(25).fill('sms'),
  ...Array(24).fill('email'),
];

// 8 SKUs as specified in the design
const SKUS = [
  { name: 'Dish Soap Concentrate',  category: 'cleaning',      avg_consumption_days: 30, price: 8.99  },
  { name: 'Shampoo Bar',            category: 'haircare',       avg_consumption_days: 60, price: 12.99 },
  { name: 'Floor Cleaner',          category: 'cleaning',       avg_consumption_days: 45, price: 9.99  },
  { name: 'Hand Wash',              category: 'personal care',  avg_consumption_days: 25, price: 6.99  },
  { name: 'Surface Cleaner Pouch',  category: 'cleaning',       avg_consumption_days: 21, price: 5.99  },
  { name: 'Conditioner Bar',        category: 'haircare',       avg_consumption_days: 50, price: 14.99 },
  { name: 'Bamboo Toothbrush',      category: 'oral care',      avg_consumption_days: 90, price: 4.99  },
  { name: 'Body Wash Bar',          category: 'personal care',  avg_consumption_days: 35, price: 11.99 },
  // 9th SKU: "Refill Concentrate" with avg_consumption_days=55 for the third anchor row
  { name: 'Refill Concentrate',     category: 'cleaning',       avg_consumption_days: 55, price: 10.49 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick a random integer in [min, max] inclusive. */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Pick a random element from an array. */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🌱  Starting Zera seed…');

    // -----------------------------------------------------------------------
    // 1. Truncate all tables in reverse FK dependency order with CASCADE
    // -----------------------------------------------------------------------
    await client.query(`
      TRUNCATE
        outbox_events,
        comm_events,
        communications,
        campaigns,
        orders,
        customers,
        product_profiles
      RESTART IDENTITY CASCADE
    `);
    console.log('✓  Truncated all tables');

    // -----------------------------------------------------------------------
    // 2. Insert product profiles (SKUs)
    // -----------------------------------------------------------------------
    const skuRows = [];
    for (const sku of SKUS) {
      const res = await client.query(
        `INSERT INTO product_profiles (name, category, avg_consumption_days, price)
         VALUES ($1, $2, $3, $4)
         RETURNING sku_id`,
        [sku.name, sku.category, sku.avg_consumption_days, sku.price],
      );
      skuRows.push({ ...sku, sku_id: res.rows[0].sku_id });
    }
    console.log(`✓  Inserted ${skuRows.length} SKUs`);

    // Build a lookup map by SKU name for convenience
    const skuByName = Object.fromEntries(skuRows.map(s => [s.name, s]));

    // -----------------------------------------------------------------------
    // 3. Insert 75 customers
    // -----------------------------------------------------------------------
    // Shuffle channel preferences so they're not in blocks
    const shuffledChannels = [...CHANNEL_PREFERENCES].sort(() => Math.random() - 0.5);

    const customerIds = [];
    for (let i = 0; i < CUSTOMER_NAMES.length; i++) {
      const name = CUSTOMER_NAMES[i];
      const email = `${name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '')}.${i + 1}@zeratest.in`;
      const phone = `+91${9000000000 + i}`;
      const channel = shuffledChannels[i];

      const res = await client.query(
        `INSERT INTO customers (name, email, phone, channel_preference)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [name, email, phone, channel],
      );
      customerIds.push(res.rows[0].id);
    }
    console.log(`✓  Inserted ${customerIds.length} customers`);

    // -----------------------------------------------------------------------
    // 4. Insert anchor orders (THREE CRITICAL rows in the 0–7 day window)
    // -----------------------------------------------------------------------
    //
    // Anchor 1: Floor Cleaner (45d) ordered 38 days ago → depletes in 7 days (45-38=7) ✓
    // Anchor 2: Conditioner Bar (50d) ordered 43 days ago → depletes in 7 days (50-43=7) ✓
    // Anchor 3: Refill Concentrate (55d) ordered 52 days ago → depletes in 3 days (55-52=3) ✓

    const anchorSku1 = skuByName['Floor Cleaner'];
    const anchorSku2 = skuByName['Conditioner Bar'];
    const anchorSku3 = skuByName['Refill Concentrate'];

    // Use the first 3 customers for anchors (deterministic)
    const [anchorCust1, anchorCust2, anchorCust3] = customerIds;

    await client.query(
      `INSERT INTO orders (customer_id, sku_id, quantity, amount, ordered_at)
       VALUES ($1, $2, $3, $4, NOW() - INTERVAL '38 days')`,
      [anchorCust1, anchorSku1.sku_id, 1, anchorSku1.price],
    );

    await client.query(
      `INSERT INTO orders (customer_id, sku_id, quantity, amount, ordered_at)
       VALUES ($1, $2, $3, $4, NOW() - INTERVAL '43 days')`,
      [anchorCust2, anchorSku2.sku_id, 1, anchorSku2.price],
    );

    await client.query(
      `INSERT INTO orders (customer_id, sku_id, quantity, amount, ordered_at)
       VALUES ($1, $2, $3, $4, NOW() - INTERVAL '52 days')`,
      [anchorCust3, anchorSku3.sku_id, 1, anchorSku3.price],
    );

    console.log('✓  Inserted 3 anchor orders (depletion window: 0–7 days)');

    // -----------------------------------------------------------------------
    // 5. Insert ~20 more targeted orders to reach 15–25 in the depletion window
    //
    // Strategy: place orders where ordered_at = NOW() - (avg_consumption_days - X)
    // with X in [0, 7] so predicted_depletes_at falls within the window.
    //
    // We'll spread them across different customers (indices 3–22) and SKUs,
    // using a variety of X values in [1, 6] to get different days_remaining.
    // -----------------------------------------------------------------------

    // SKUs suitable for window orders (exclude the 3 already-used anchors)
    const windowSkus = [
      { sku: skuByName['Dish Soap Concentrate'],  x: 2 },  // ordered 28d ago → depletes in 2d
      { sku: skuByName['Shampoo Bar'],             x: 5 },  // ordered 55d ago → depletes in 5d
      { sku: skuByName['Floor Cleaner'],           x: 3 },  // ordered 42d ago → depletes in 3d
      { sku: skuByName['Hand Wash'],               x: 1 },  // ordered 24d ago → depletes in 1d
      { sku: skuByName['Surface Cleaner Pouch'],   x: 4 },  // ordered 17d ago → depletes in 4d
      { sku: skuByName['Conditioner Bar'],         x: 2 },  // ordered 48d ago → depletes in 2d
      { sku: skuByName['Bamboo Toothbrush'],       x: 6 },  // ordered 84d ago → depletes in 6d
      { sku: skuByName['Body Wash Bar'],           x: 0 },  // ordered 35d ago → depletes in 0d (today)
      { sku: skuByName['Refill Concentrate'],      x: 1 },  // ordered 54d ago → depletes in 1d
      { sku: skuByName['Dish Soap Concentrate'],   x: 6 },  // ordered 24d ago → depletes in 6d
      { sku: skuByName['Shampoo Bar'],             x: 3 },  // ordered 57d ago → depletes in 3d
      { sku: skuByName['Hand Wash'],               x: 5 },  // ordered 20d ago → depletes in 5d
      { sku: skuByName['Surface Cleaner Pouch'],   x: 2 },  // ordered 19d ago → depletes in 2d
      { sku: skuByName['Bamboo Toothbrush'],       x: 4 },  // ordered 86d ago → depletes in 4d
      { sku: skuByName['Body Wash Bar'],           x: 1 },  // ordered 34d ago → depletes in 1d
      { sku: skuByName['Floor Cleaner'],           x: 5 },  // ordered 40d ago → depletes in 5d
      { sku: skuByName['Conditioner Bar'],         x: 6 },  // ordered 44d ago → depletes in 6d
      { sku: skuByName['Dish Soap Concentrate'],   x: 1 },  // ordered 29d ago → depletes in 1d
      { sku: skuByName['Refill Concentrate'],      x: 4 },  // ordered 51d ago → depletes in 4d
      { sku: skuByName['Shampoo Bar'],             x: 0 },  // ordered 60d ago → depletes in 0d (today)
    ];

    // Customers 3..22 (indices) are used for the 20 window orders
    for (let i = 0; i < windowSkus.length; i++) {
      const { sku, x } = windowSkus[i];
      const custId = customerIds[3 + i]; // customers 3–22
      const daysBack = sku.avg_consumption_days - x;

      await client.query(
        `INSERT INTO orders (customer_id, sku_id, quantity, amount, ordered_at)
         VALUES ($1, $2, $3, $4, NOW() - ($5 || ' days')::INTERVAL)`,
        [custId, sku.sku_id, 1, sku.price, daysBack],
      );
    }

    console.log(`✓  Inserted ${windowSkus.length} targeted window orders`);

    // -----------------------------------------------------------------------
    // 6. Insert background orders — spread across past 180 days
    //    for the remaining customers (indices 23–74) plus some repeat orders
    //    for earlier customers to give them purchase history depth.
    // -----------------------------------------------------------------------

    // The standard 8 SKUs (excluding Refill Concentrate) for regular orders
    const standardSkus = skuRows.filter(s => s.name !== 'Refill Concentrate');

    let bgOrderCount = 0;

    // One or two past orders per remaining customer (indices 23–74)
    for (let i = 23; i < customerIds.length; i++) {
      const custId = customerIds[i];
      // Pick 1 or 2 orders per customer
      const numOrders = randInt(1, 2);
      for (let j = 0; j < numOrders; j++) {
        const sku = pick(standardSkus);
        // Place order 30–180 days ago (outside the depletion window)
        const daysBack = randInt(sku.avg_consumption_days + 8, 180);
        const qty = randInt(1, 2);
        await client.query(
          `INSERT INTO orders (customer_id, sku_id, quantity, amount, ordered_at)
           VALUES ($1, $2, $3, $4, NOW() - ($5 || ' days')::INTERVAL)`,
          [custId, sku.sku_id, qty, sku.price * qty, daysBack],
        );
        bgOrderCount++;
      }
    }

    // Additional past orders for customers 0–22 (anchor/window customers)
    // to give them realistic purchase history, placed well outside the window.
    // We must NOT use the same SKU as the customer's anchor/window order, because
    // the depletion query picks MAX(ordered_at) per (customer_id, sku_id) — a newer
    // background order for the same SKU would shadow the targeted window order.
    // Build a map of which SKU each anchor/window customer already has.
    const custWindowSku = new Map();
    custWindowSku.set(anchorCust1, anchorSku1.sku_id);
    custWindowSku.set(anchorCust2, anchorSku2.sku_id);
    custWindowSku.set(anchorCust3, anchorSku3.sku_id);
    for (let i = 0; i < windowSkus.length; i++) {
      custWindowSku.set(customerIds[3 + i], windowSkus[i].sku.sku_id);
    }

    for (let i = 0; i < 23; i++) {
      const custId = customerIds[i];
      const reservedSkuId = custWindowSku.get(custId);
      // Pick a SKU different from the reserved one
      const availableSkus = standardSkus.filter(s => s.sku_id !== reservedSkuId);
      const sku = pick(availableSkus);
      const daysBack = randInt(90, 180);
      await client.query(
        `INSERT INTO orders (customer_id, sku_id, quantity, amount, ordered_at)
         VALUES ($1, $2, $3, $4, NOW() - ($5 || ' days')::INTERVAL)`,
        [custId, sku.sku_id, 1, sku.price, daysBack],
      );
      bgOrderCount++;
    }

    console.log(`✓  Inserted ${bgOrderCount} background orders`);

    // -----------------------------------------------------------------------
    // 7. Verification — run the depletion query and report the count
    // -----------------------------------------------------------------------
    const verifyRes = await client.query(`
      SELECT
        c.id                                                        AS customer_id,
        c.name,
        o.sku_id,
        p.name                                                      AS product_name,
        (o.ordered_at + (p.avg_consumption_days || ' days')::INTERVAL) AS predicted_depletes_at,
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
    `);

    const windowCount = verifyRes.rows.length;
    console.log(`\n📊  Depletion window (0–7 days): ${windowCount} customers`);
    verifyRes.rows.forEach(r => {
      console.log(`    • ${r.name.padEnd(25)} ${r.product_name.padEnd(25)} → ${r.days_remaining}d remaining`);
    });

    if (windowCount < 15 || windowCount > 25) {
      console.warn(`⚠️   WARNING: expected 15–25 customers in window, got ${windowCount}`);
    } else {
      console.log(`✅  Window count ${windowCount} is within the 15–25 target range`);
    }

    console.log('\n🎉  Seed complete!\n');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

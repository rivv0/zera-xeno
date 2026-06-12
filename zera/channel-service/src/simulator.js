/**
 * channel-service/src/simulator.js
 *
 * Delivery state machine — simulates async lifecycle events (sent → delivered/failed
 * → opened → clicked) for a single comm_id and fires webhook callbacks to CRM_Service.
 *
 * Requirements: 8.2–8.6, 8.8–8.9
 */

const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a random integer between min and max (inclusive).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randMs(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns true with probability p (0 ≤ p ≤ 1).
 * @param {number} p
 * @returns {boolean}
 */
export function prob(p) {
  return Math.random() < p;
}

// ---------------------------------------------------------------------------
// Callback delivery with retry
// ---------------------------------------------------------------------------

/**
 * POST a delivery receipt to CRM_Service.  Retries up to `retries` times at
 * 1000 ms intervals when the response is non-2xx or the network fails.
 *
 * @param {{ comm_id: string, event_type: string, occurred_at: string }} payload
 * @param {number} [retries=3]
 * @returns {Promise<void>}
 */
async function fireCallback(payload, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${CRM_SERVICE_URL}/api/receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        // 2xx — success, stop retrying
        return;
      }

      // Non-2xx response — log and retry (if attempts remain)
      console.warn(
        `[simulator] callback ${payload.event_type} for ${payload.comm_id} ` +
          `got HTTP ${res.status} (attempt ${attempt + 1}/${retries + 1})`
      );
    } catch (err) {
      // Network error — log and retry (if attempts remain)
      console.warn(
        `[simulator] callback ${payload.event_type} for ${payload.comm_id} ` +
          `network error (attempt ${attempt + 1}/${retries + 1}): ${err.message}`
      );
    }

    // Wait 1000 ms before the next attempt (skip delay after the last attempt)
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.error(
    `[simulator] callback ${payload.event_type} for ${payload.comm_id} ` +
      `abandoned after ${retries + 1} attempt(s)`
  );
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/**
 * Schedule the full async delivery lifecycle for a single communication.
 * Returns immediately; all callbacks fire asynchronously via setTimeout chains.
 *
 * Delivery funnel:
 *   [100–300ms]  sent
 *       └──► [300–1500ms]  delivered (85%) OR failed (15%)
 *                └──► (email|rcs only) [500–3000ms]  opened (40%)
 *                         └──► (email|rcs only) [500–2000ms]  clicked (25%)
 *
 * @param {string} commId   - The communication record ID.
 * @param {string} channel  - One of 'sms', 'email', 'rcs'.
 */
export function simulate(commId, channel) {
  const engageable = channel === 'email' || channel === 'rcs';

  // ── 1. sent ──────────────────────────────────────────────────────────────
  setTimeout(() => {
    fireCallback({
      comm_id: commId,
      event_type: 'sent',
      occurred_at: new Date().toISOString(),
    });

    // ── 2. delivered OR failed ────────────────────────────────────────────
    setTimeout(() => {
      if (prob(0.85)) {
        // delivered path
        fireCallback({
          comm_id: commId,
          event_type: 'delivered',
          occurred_at: new Date().toISOString(),
        });

        // ── 3. opened (email/rcs only, 40%) ──────────────────────────────
        if (engageable) {
          setTimeout(() => {
            if (prob(0.4)) {
              fireCallback({
                comm_id: commId,
                event_type: 'opened',
                occurred_at: new Date().toISOString(),
              });

              // ── 4. clicked (email/rcs only, 25%) ───────────────────────
              setTimeout(() => {
                if (prob(0.25)) {
                  fireCallback({
                    comm_id: commId,
                    event_type: 'clicked',
                    occurred_at: new Date().toISOString(),
                  });
                }
              }, randMs(500, 2000));
            }
          }, randMs(500, 3000));
        }
      } else {
        // failed path (15%)
        fireCallback({
          comm_id: commId,
          event_type: 'failed',
          occurred_at: new Date().toISOString(),
        });
      }
    }, randMs(300, 1500));
  }, randMs(100, 300));
}

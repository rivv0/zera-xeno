/**
 * segmentResolver.js
 *
 * Translates a Segment_Query JSON object into a parameterised PostgreSQL query.
 * Claude never generates SQL — only the whitelisted fields and pre-built clause
 * templates are used.
 */

export class SegmentResolutionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SegmentResolutionError';
  }
}

/**
 * Validate the types of all fields in a Segment_Query object.
 * Throws SegmentResolutionError if any field is present but has the wrong type.
 *
 * @param {object} segmentQuery
 */
function validateTypes(segmentQuery) {
  const { recency_days, min_orders, sku_ids, channel_preference, depletion_window_days } = segmentQuery;

  if (recency_days !== null && recency_days !== undefined) {
    if (typeof recency_days !== 'number') {
      throw new SegmentResolutionError(
        `Invalid type for recency_days: expected number, got ${typeof recency_days}`
      );
    }
  }

  if (min_orders !== null && min_orders !== undefined) {
    if (typeof min_orders !== 'number') {
      throw new SegmentResolutionError(
        `Invalid type for min_orders: expected number, got ${typeof min_orders}`
      );
    }
  }

  if (sku_ids !== null && sku_ids !== undefined) {
    if (!Array.isArray(sku_ids) || !sku_ids.every((s) => typeof s === 'string')) {
      throw new SegmentResolutionError(
        `Invalid type for sku_ids: expected array of strings`
      );
    }
  }

  if (channel_preference !== null && channel_preference !== undefined) {
    if (typeof channel_preference !== 'string') {
      throw new SegmentResolutionError(
        `Invalid type for channel_preference: expected string, got ${typeof channel_preference}`
      );
    }
  }

  if (depletion_window_days !== null && depletion_window_days !== undefined) {
    if (typeof depletion_window_days !== 'number') {
      throw new SegmentResolutionError(
        `Invalid type for depletion_window_days: expected number, got ${typeof depletion_window_days}`
      );
    }
  }
}

const BASE_SQL = `SELECT DISTINCT
  c.id           AS customer_id,
  c.name,
  o.sku_id,
  p.name         AS product_name
FROM customers c
JOIN orders o          ON o.customer_id = c.id
JOIN product_profiles p ON p.sku_id     = o.sku_id
WHERE 1=1`;

/**
 * Resolve a Segment_Query against the database.
 *
 * @param {object} segmentQuery  - The segment query object from Claude / the API.
 * @param {object} pool          - A `pg.Pool` (or compatible) instance.
 * @returns {Promise<Array<{customer_id: string, name: string, sku_id: string, product_name: string}>>}
 */
export async function resolve(segmentQuery, pool) {
  // 1. Type-check all fields — throws SegmentResolutionError on violation
  validateTypes(segmentQuery);

  const { recency_days, min_orders, sku_ids, channel_preference, depletion_window_days } = segmentQuery;

  const whereClauses = [];
  const havingClauses = [];
  const params = [];

  // Helper: allocate next positional parameter
  const nextParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  // recency_days → AND o.ordered_at >= NOW() - ($N || ' days')::INTERVAL
  if (recency_days != null) {
    const p = nextParam(recency_days);
    whereClauses.push(`AND o.ordered_at >= NOW() - (${p} || ' days')::INTERVAL`);
  }

  // sku_ids → AND o.sku_id = ANY($N)
  if (sku_ids != null) {
    const p = nextParam(sku_ids);
    whereClauses.push(`AND o.sku_id = ANY(${p})`);
  }

  // channel_preference → AND c.channel_preference = $N
  if (channel_preference != null) {
    const p = nextParam(channel_preference);
    whereClauses.push(`AND c.channel_preference = ${p}`);
  }

  // depletion_window_days → AND (o.ordered_at + (p.avg_consumption_days || ' days')::INTERVAL)
  //                              BETWEEN NOW() AND NOW() + ($N || ' days')::INTERVAL
  if (depletion_window_days != null) {
    const p = nextParam(depletion_window_days);
    whereClauses.push(
      `AND (o.ordered_at + (p.avg_consumption_days || ' days')::INTERVAL)\n` +
      `       BETWEEN NOW() AND NOW() + (${p} || ' days')::INTERVAL`
    );
  }

  // min_orders → HAVING COUNT(DISTINCT o.id) >= $N
  if (min_orders != null) {
    const p = nextParam(min_orders);
    havingClauses.push(`HAVING COUNT(DISTINCT o.id) >= ${p}`);
  }

  // Assemble full query
  let sql = BASE_SQL;

  if (whereClauses.length > 0) {
    sql += '\n' + whereClauses.join('\n');
  }

  // GROUP BY is required when HAVING is used
  if (havingClauses.length > 0) {
    sql += '\nGROUP BY c.id, c.name, o.sku_id, p.name';
    sql += '\n' + havingClauses.join('\n');
  }

  const result = await pool.query(sql, params);
  return result.rows;
}

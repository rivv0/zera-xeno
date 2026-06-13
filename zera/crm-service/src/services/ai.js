import Anthropic from '@anthropic-ai/sdk';

// ─── System prompts ────────────────────────────────────────────────────────────

const DAILY_BRIEF_SYSTEM_PROMPT =
  'You are a CRM strategist for D2C zero-waste brands. You will be given a JSON array of customers predicted to deplete a product within 7 days. Return ONLY a JSON array of 2-3 campaign brief objects with no preamble, no markdown, and no commentary. Each object must contain exactly these fields: segment_label (string), rationale (string), audience_size (non-negative integer), suggested_message (string using {name} and {product} placeholders, max 320 chars), estimated_revenue (non-negative number = audience_size x average order value), urgency ("high"|"medium"|"low").';

const NL_SEGMENT_SYSTEM_PROMPT =
  'You are a segment query translator. Convert the user\'s natural-language description into a JSON object. Return ONLY the JSON object with no preamble, no markdown. The object must contain exactly these fields and no others: recency_days (number or null), min_orders (number or null), sku_ids (array of strings or null), channel_preference (string or null), depletion_window_days (number or null).';

// ─── In-memory cache ───────────────────────────────────────────────────────────

export let briefCache = { briefs: [], cached_at: null, error: null };

const FALLBACK_BRIEFS = [
  {
    segment_label: "Urgent Floor Cleaner Restock",
    rationale: "Eco-shoppers who ordered Floor Cleaner and are running out within 7 days.",
    audience_size: 4,
    suggested_message: "Hi {name}, your Floor Cleaner is running low. Reorder now for 10% off!",
    estimated_revenue: 39.96,
    urgency: "high",
    channel: "email",
    segment_query: { depletion_window_days: 7, channel_preference: "email" }
  },
  {
    segment_label: "Dish Soap Refill Campaign",
    rationale: "Customers predicted to run out of Dish Soap in the next 7 days.",
    audience_size: 6,
    suggested_message: "Hello {name}! Ready for your next zero-waste refill of {product}? Order now!",
    estimated_revenue: 53.94,
    urgency: "medium",
    channel: "whatsapp",
    segment_query: { depletion_window_days: 7, channel_preference: "whatsapp" }
  },
  {
    segment_label: "Shampoo Bar Top-up",
    rationale: "Eco-shoppers who are due for their next Shampoo Bar replacement.",
    audience_size: 5,
    suggested_message: "Hi {name}, time to restock your {product} to keep your hair clean and plastic-free!",
    estimated_revenue: 64.95,
    urgency: "low",
    channel: "sms",
    segment_query: { depletion_window_days: 7, channel_preference: "sms" }
  }
];

// ─── Anthropic client ──────────────────────────────────────────────────────────

const client = new Anthropic();

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Race a promise against a timeout that rejects after `ms` milliseconds.
 */
function withTimeout(promise, ms, label) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

/**
 * Strips markdown code block ticks from a string before JSON parsing.
 */
function cleanJsonString(str) {
  let cleaned = str.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
  }
  return cleaned;
}

/**
 * Dynamically resolves the API configuration based on active environment variables.
 */
function getAIServiceConfig() {
  const key = process.env.GROQ_API_KEY || process.env.GROK_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  // Groq API check (starts with gsk_)
  if (key.startsWith('gsk_') || process.env.GROQ_API_KEY) {
    return {
      type: 'groq',
      apiKey: key,
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    };
  }

  // Grok API check (starts with xai-)
  if (key.startsWith('xai-') || (process.env.GROK_API_KEY && !key.startsWith('gsk_'))) {
    return {
      type: 'grok',
      apiKey: key,
      endpoint: 'https://api.x.ai/v1/chat/completions',
      model: process.env.GROK_MODEL || 'grok-2',
    };
  }

  // Anthropic default
  return {
    type: 'anthropic',
    apiKey: key,
  };
}

// ─── Validators ───────────────────────────────────────────────────────────────

const BRIEF_FIELDS = new Set([
  'segment_label',
  'rationale',
  'audience_size',
  'suggested_message',
  'estimated_revenue',
  'urgency',
]);

const URGENCY_VALUES = new Set(['high', 'medium', 'low']);

/**
 * Returns true iff `obj` has exactly the right fields and types for a brief.
 *
 * Required fields:
 *   segment_label    — string
 *   rationale        — string
 *   audience_size    — non-negative integer
 *   suggested_message — string ≤ 320 chars
 *   estimated_revenue — non-negative number
 *   urgency          — 'high' | 'medium' | 'low'
 */
export function validateBrief(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return false;

  const keys = Object.keys(obj);

  // Must have exactly the right number of keys and no extras
  if (keys.length !== BRIEF_FIELDS.size) return false;
  for (const key of keys) {
    if (!BRIEF_FIELDS.has(key)) return false;
  }

  if (typeof obj.segment_label !== 'string') return false;
  if (typeof obj.rationale !== 'string') return false;

  if (
    typeof obj.audience_size !== 'number' ||
    !Number.isInteger(obj.audience_size) ||
    obj.audience_size < 0
  ) return false;

  if (
    typeof obj.suggested_message !== 'string' ||
    obj.suggested_message.length > 320
  ) return false;

  if (
    typeof obj.estimated_revenue !== 'number' ||
    obj.estimated_revenue < 0
  ) return false;

  if (!URGENCY_VALUES.has(obj.urgency)) return false;

  return true;
}

const SEGMENT_QUERY_ALLOWED_FIELDS = new Set([
  'recency_days',
  'min_orders',
  'sku_ids',
  'channel_preference',
  'depletion_window_days',
]);

/**
 * Returns true iff `obj` contains only allowed Segment_Query fields.
 * Each present field must be either null or the correct type:
 *   recency_days          — number | null
 *   min_orders            — number | null
 *   sku_ids               — string[] | null
 *   channel_preference    — string | null
 *   depletion_window_days — number | null
 */
export function validateSegmentQuery(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return false;

  for (const key of Object.keys(obj)) {
    if (!SEGMENT_QUERY_ALLOWED_FIELDS.has(key)) return false;
  }

  const { recency_days, min_orders, sku_ids, channel_preference, depletion_window_days } = obj;

  if ('recency_days' in obj && recency_days !== null && typeof recency_days !== 'number') return false;
  if ('min_orders' in obj && min_orders !== null && typeof min_orders !== 'number') return false;
  if ('sku_ids' in obj && sku_ids !== null) {
    if (!Array.isArray(sku_ids)) return false;
    if (!sku_ids.every((s) => typeof s === 'string')) return false;
  }
  if ('channel_preference' in obj && channel_preference !== null && typeof channel_preference !== 'string') return false;
  if ('depletion_window_days' in obj && depletion_window_days !== null && typeof depletion_window_days !== 'number') return false;

  return true;
}

// ─── generateDailyBrief ───────────────────────────────────────────────────────

/**
 * Call Claude to generate 2-3 campaign briefs from depletion data.
 * Updates `briefCache` on success.
 * On error: logs and returns cached briefs (or empty array with error indicator).
 *
 * @param {object[]} depletionData  rows from the depletion window query
 * @returns {object[]}              array of validated brief objects
 */
export async function generateDailyBrief(depletionData) {
  try {
    const config = getAIServiceConfig();
    let raw = '';

    if (!config) {
      throw new Error('No AI service API key found (Anthropic, Groq, or Grok)');
    }

    if (config.type === 'groq' || config.type === 'grok') {
      const apiCall = fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: DAILY_BRIEF_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(depletionData) },
          ],
          max_tokens: 1024,
          temperature: 0,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`${config.type.toUpperCase()} API returned HTTP ${res.status}: ${body}`);
        }
        return res.json();
      });

      const response = await withTimeout(apiCall, 30000, `generateDailyBrief (${config.type})`);
      raw = response.choices[0]?.message?.content ?? '';
    } else {
      const apiCall = client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: DAILY_BRIEF_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(depletionData) }],
      });

      const response = await withTimeout(apiCall, 30000, 'generateDailyBrief');
      raw = response.content[0]?.text ?? '';
    }

    let parsed;
    try {
      parsed = JSON.parse(cleanJsonString(raw));
    } catch (parseErr) {
      console.error('[ai] generateDailyBrief: failed to parse response as JSON:', parseErr.message);
      console.error('[ai] raw response:', raw);
      return briefCache.briefs.length > 0
        ? briefCache.briefs
        : [];
    }

    if (!Array.isArray(parsed)) {
      console.error('[ai] generateDailyBrief: response is not an array');
      return briefCache.briefs.length > 0 ? briefCache.briefs : [];
    }

    const valid = parsed.filter((item) => {
      const ok = validateBrief(item);
      if (!ok) console.error('[ai] generateDailyBrief: brief failed schema validation:', JSON.stringify(item));
      return ok;
    });

    if (valid.length === 0) {
      console.error('[ai] generateDailyBrief: no valid briefs in response');
      return briefCache.briefs.length > 0 ? briefCache.briefs : [];
    }

    const augmented = valid.map((brief, index) => {
      const channels = ['email', 'whatsapp', 'sms'];
      const channel = channels[index % channels.length];
      return {
        ...brief,
        channel,
        segment_query: {
          depletion_window_days: 7,
          channel_preference: channel,
        },
      };
    });

    briefCache = { briefs: augmented, cached_at: new Date().toISOString(), error: null };
    return augmented;
  } catch (err) {
    console.error('[ai] generateDailyBrief error:', err.message);
    const fallback = FALLBACK_BRIEFS;
    briefCache = {
      briefs: briefCache.briefs.length > 0 ? briefCache.briefs : fallback,
      cached_at: briefCache.cached_at || new Date().toISOString(),
      error: err.message,
    };
    return briefCache.briefs;
  }
}

// ─── resolveNLSegment ─────────────────────────────────────────────────────────

/**
 * Call Claude to translate a natural-language description into a Segment_Query.
 * Throws on error — let the route handle HTTP status codes.
 *
 * @param {string} description  natural-language audience description
 * @returns {object}            validated Segment_Query object
 * @throws {Error}              on timeout, parse failure, or invalid schema
 */
export async function resolveNLSegment(description) {
  let raw = '';
  const config = getAIServiceConfig();

  if (!config) {
    throw new Error('No AI service API key found (Anthropic, Groq, or Grok)');
  }

  try {
    if (config.type === 'groq' || config.type === 'grok') {
      const apiCall = fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: NL_SEGMENT_SYSTEM_PROMPT },
            { role: 'user', content: description },
          ],
          max_tokens: 512,
          temperature: 0,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`${config.type.toUpperCase()} API returned HTTP ${res.status}: ${body}`);
        }
        return res.json();
      });

      const response = await withTimeout(apiCall, 25000, `resolveNLSegment (${config.type})`);
      raw = response.choices[0]?.message?.content ?? '';
    } else {
      const apiCall = client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: NL_SEGMENT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: description }],
      });

      const response = await withTimeout(apiCall, 25000, 'resolveNLSegment');
      raw = response.content[0]?.text ?? '';
    }
  } catch (err) {
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(cleanJsonString(raw));
  } catch (parseErr) {
    const err = new Error('AI service returned an unparseable response');
    err.code = 'PARSE_ERROR';
    err.raw = raw;
    throw err;
  }

  if (!validateSegmentQuery(parsed)) {
    const extraFields = Object.keys(parsed).filter((k) => !SEGMENT_QUERY_ALLOWED_FIELDS.has(k));
    const err = new Error('AI service returned a Segment_Query with unexpected fields');
    err.code = 'SCHEMA_ERROR';
    err.extraFields = extraFields;
    throw err;
  }

  return parsed;
}

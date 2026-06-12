/**
 * Telemetry Service
 * Maintains an in-memory ring-buffer of the latest 100 system events
 * for the live activity feed terminal.
 */

const MAX_LOGS = 100;
let logs = [];

// Seed the telemetry with some initial system status logs
logs.push({
  id: Math.random().toString(36).substring(2, 9),
  timestamp: new Date().toISOString(),
  type: 'SYSTEM',
  message: 'Zera CRM Telemetry Service initialized successfully.',
  details: {}
});

/**
 * Log a new system event
 * @param {('SYSTEM'|'ORDER'|'LEARNING'|'LAUNCH'|'RECEIPT'|'CLOCK')} type - Event category
 * @param {string} message - Descriptive text
 * @param {object} [details] - Optional extra metadata
 */
export function logEvent(type, message, details = {}) {
  const event = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    type,
    message,
    details
  };

  logs.unshift(event);

  if (logs.length > MAX_LOGS) {
    logs.pop();
  }

  // Print to system console for standard logging
  console.log(`[Telemetry:${type}] ${message}`);
}

/**
 * Get all buffered events
 * @returns {object[]} logs list
 */
export function getEvents() {
  return logs;
}

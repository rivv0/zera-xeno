// Map CRM-service channel names to channel-service channel names.
// crm-service uses: email | sms | whatsapp
// channel-service accepts: email | sms | rcs
const CHANNEL_MAP = {
  whatsapp: 'rcs',
};

const BASE_URL = process.env.CHANNEL_SERVICE_URL ?? 'http://localhost:4001';

/**
 * Send a communication via channel-service.
 *
 * @param {{ commId: string, channel: string, message: string }} params
 * @returns {Promise<Response>} The raw fetch Response — caller checks `.status`.
 */
export async function send({ commId, channel, message }) {
  const mappedChannel = CHANNEL_MAP[channel] ?? channel;

  const res = await fetch(`${BASE_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comm_id: commId, channel: mappedChannel, message }),
  });

  return res;
}

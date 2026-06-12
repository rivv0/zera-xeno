import express from 'express';

// simulator will be implemented in task 2.2
import { simulate } from './simulator.js';

const app = express();
app.use(express.json());

const VALID_CHANNELS = ['sms', 'email', 'rcs'];

// POST /send — validate comm_id and channel, return 202 immediately, then simulate async
app.post('/send', (req, res) => {
  const { comm_id, channel } = req.body;

  if (!comm_id || typeof comm_id !== 'string' || comm_id.trim() === '') {
    return res.status(400).json({ error: 'comm_id must be a non-empty string' });
  }

  if (!channel || !VALID_CHANNELS.includes(channel)) {
    return res.status(400).json({
      error: `channel must be one of: ${VALID_CHANNELS.join(', ')}`,
    });
  }

  // Respond immediately with 202 Accepted
  res.status(202).json({ accepted: true });

  // Fire-and-forget simulation (async, non-blocking)
  setImmediate(() => simulate(comm_id, channel));
});

// GET /health — liveness probe
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

const PORT = process.env.CHANNEL_PORT || process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`channel-service listening on port ${PORT}`);
});

export default app;

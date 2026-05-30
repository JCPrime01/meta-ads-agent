import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { migrate } from './db/postgres';
import { startCron } from './cron/optimizer';
import campaignsRouter from './routes/campaigns';
import insightsRouter from './routes/insights';
import agentRouter from './routes/agent';
import { requireApiSecret } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 3002;

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (origin.endsWith('.vercel.app')) return cb(null, true);
    if (origin.startsWith('http://localhost')) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));

app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(requireApiSecret);
app.use('/campaigns', campaignsRouter);
app.use('/insights', insightsRouter);
app.use('/agent', agentRouter);

async function start() {
  try {
    await migrate();
    startCron();
  } catch (err) {
    console.error('[startup] falha:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[server] http://localhost:${PORT}`);
  });
}

start();

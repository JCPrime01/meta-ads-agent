import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { migrate } from './db/postgres';
import { startCron } from './cron/optimizer';
import authRouter from './routes/auth';
import campaignsRouter from './routes/campaigns';
import insightsRouter from './routes/insights';
import agentRouter from './routes/agent';
import { requireAuth, getJwtSecret } from './middleware/auth';

// Fail-fast se JWT_SECRET inválido
getJwtSecret();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(helmet());

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (origin.startsWith('http://localhost')) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/auth', authRouter);

app.use(requireAuth);
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

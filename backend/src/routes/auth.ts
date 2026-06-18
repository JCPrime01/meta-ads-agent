import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { signToken } from '../middleware/auth';

const router = Router();

router.post('/login', (req, res) => {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    res.status(500).json({ error: 'Erro interno' });
    return;
  }
  const provided = String(req.body?.password ?? '');
  let valid = false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(password);
    valid = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    valid = false;
  }
  if (!valid) {
    res.status(401).json({ error: 'Senha incorreta' });
    return;
  }
  res.json({ ok: true, token: signToken() });
});

export default router;

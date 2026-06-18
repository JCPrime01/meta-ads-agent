import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import rateLimit from 'express-rate-limit';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { signToken } from '../middleware/auth';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde 15 minutos.' },
});

function checkPassword(provided: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(password);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function is2FAEnabled(): boolean {
  return Boolean(process.env.TOTP_SECRET);
}

router.get('/2fa/status', (_req, res) => {
  res.json({ enabled: is2FAEnabled() });
});

router.get('/2fa/setup', async (req, res) => {
  const provided = String(req.query.password ?? '');
  if (!checkPassword(provided)) {
    res.status(401).json({ error: 'Senha incorreta' });
    return;
  }
  const secret = process.env.TOTP_SECRET;
  if (!secret) {
    res.status(400).json({ error: 'TOTP_SECRET não configurado no servidor' });
    return;
  }
  const otpauth = authenticator.keyuri('admin', 'Meta Ads Agent', secret);
  const qr = await QRCode.toDataURL(otpauth);
  res.json({ qr, secret, otpauth });
});

router.post('/login', loginLimiter, (req, res) => {
  const provided = String(req.body?.password ?? '');
  if (!checkPassword(provided)) {
    res.status(401).json({ error: 'Senha incorreta' });
    return;
  }

  if (is2FAEnabled()) {
    const code = String(req.body?.code ?? '');
    if (!code) {
      res.status(401).json({ error: 'Código 2FA obrigatório', require2fa: true });
      return;
    }
    const valid = authenticator.verify({ token: code, secret: process.env.TOTP_SECRET! });
    if (!valid) {
      res.status(401).json({ error: 'Código 2FA inválido' });
      return;
    }
  }

  res.json({ ok: true, token: signToken() });
});

export default router;

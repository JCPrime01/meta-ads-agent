import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

export function requireApiSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.API_SECRET;
  if (!secret) {
    console.error('[auth] API_SECRET não configurado — rejeitando todas as requisições');
    res.status(500).json({ error: 'Server misconfigured' });
    return;
  }

  const auth = req.headers.authorization;
  const provided = auth?.startsWith('Bearer ') ? auth.slice(7) : '';

  let valid = false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    valid = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    valid = false;
  }

  if (!valid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

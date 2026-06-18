import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s === 'changeme') {
    console.error('[auth] JWT_SECRET inválido — abortando');
    process.exit(1);
  }
  return s;
}

export function signToken(): string {
  return jwt.sign({ role: 'admin' }, getJwtSecret(), { expiresIn: '7d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    jwt.verify(token, getJwtSecret());
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

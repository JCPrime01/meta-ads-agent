import { Request, Response, NextFunction } from 'express';

export function requireApiSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.API_SECRET;
  if (!secret) { next(); return; }

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

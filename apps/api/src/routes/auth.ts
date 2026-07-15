// ─────────────────────────────────────────────────────────────────────────────
// Auth Router — local desktop app, no accounts. Every endpoint returns the
// static local user so any legacy UI calls keep working.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';

export const authRouter = Router();

const LOCAL_USER = {
  id: 'local-dev-user',
  email: 'dev@localhost',
  name: 'Local Developer',
  role: 'admin',
  provider: 'local',
  isActive: true,
};

const LOCAL_SESSION = {
  user: LOCAL_USER,
  accessToken: 'local',
  expiresIn: 60 * 60 * 24 * 365,
};

// POST /api/auth/register — no-op, sign in as local user
authRouter.post('/register', (_req: Request, res: Response) => {
  res.status(201).json({ success: true, data: LOCAL_SESSION });
});

// POST /api/auth/login — no-op, sign in as local user
authRouter.post('/login', (_req: Request, res: Response) => {
  res.json({ success: true, data: LOCAL_SESSION });
});

// POST /api/auth/refresh
authRouter.post('/refresh', (_req: Request, res: Response) => {
  res.json({ success: true, data: LOCAL_SESSION });
});

// POST /api/auth/logout
authRouter.post('/logout', (_req: Request, res: Response) => {
  res.json({ success: true, data: { message: 'Logged out' } });
});

// POST /api/auth/logout-all
authRouter.post('/logout-all', (_req: Request, res: Response) => {
  res.json({ success: true, data: { message: 'Logged out' } });
});

// GET /api/auth/me
authRouter.get('/me', authenticate, (_req: Request, res: Response) => {
  res.json({ success: true, data: LOCAL_USER });
});

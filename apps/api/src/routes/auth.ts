// ─────────────────────────────────────────────────────────────────────────────
// Auth Router
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { RegisterSchema, LoginSchema } from '@ibm-agent/shared';

export const authRouter = Router();

// POST /api/auth/register
authRouter.post('/register', validate(RegisterSchema), async (req: Request, res: Response) => {
  const result = await authService.register(req.body);

  res.cookie('refresh_token', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    },
  });
});

// POST /api/auth/login
authRouter.post('/login', validate(LoginSchema), async (req: Request, res: Response) => {
  const result = await authService.login(req.body);

  res.cookie('refresh_token', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    },
  });
});

// POST /api/auth/refresh
authRouter.post('/refresh', async (req: Request, res: Response) => {
  const token: string =
    req.cookies?.refresh_token ?? (req.body as { refreshToken?: string }).refreshToken ?? '';

  if (!token) {
    res.status(401).json({ success: false, error: { code: 'NO_TOKEN', message: 'No refresh token' } });
    return;
  }

  const result = await authService.refresh(token);

  res.json({
    success: true,
    data: { user: result.user, accessToken: result.accessToken, expiresIn: result.expiresIn },
  });
});

// POST /api/auth/logout
authRouter.post('/logout', authenticate, async (req: Request, res: Response) => {
  const token: string = req.cookies?.refresh_token ?? '';
  if (token) {
    await authService.logout(token);
  }

  res.clearCookie('refresh_token');
  res.json({ success: true, data: { message: 'Logged out' } });
});

// POST /api/auth/logout-all
authRouter.post('/logout-all', authenticate, async (req: Request, res: Response) => {
  await authService.logoutAll(req.user!.sub);
  res.clearCookie('refresh_token');
  res.json({ success: true, data: { message: 'All sessions revoked' } });
});

// GET /api/auth/me
authRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  const user = await authService.getProfile(req.user!.sub);
  res.json({ success: true, data: user });
});

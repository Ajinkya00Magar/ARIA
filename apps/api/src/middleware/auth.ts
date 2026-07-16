// ─────────────────────────────────────────────────────────────────────────────
// Auth Middleware — Disabled for local/open access
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express';
import type { AuthTokenPayload } from '@ibm-agent/types';
import { supabase } from '../lib/supabase';
import { env } from '../lib/env';
import { createLogger } from '../lib/logger';

const logger = createLogger('auth');

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing Authorization header' } });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
      return;
    }

    req.user = { 
      sub: user.id, 
      email: user.email || '', 
      role: 'developer', 
      iat: Math.floor(Date.now() / 1000), 
      exp: Math.floor(Date.now() / 1000) + 3600 
    };
    
    next();
  } catch (err) {
    logger.error({ err }, 'Failed to verify Supabase token');
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to authenticate' } });
    return;
  }
}

export function requireRole(..._roles: string[]) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  };
}

export function optionalAuth(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

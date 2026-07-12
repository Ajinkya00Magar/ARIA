// ─────────────────────────────────────────────────────────────────────────────
// Auth Middleware — Disabled for local/open access
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express';
import type { AuthTokenPayload } from '@ibm-agent/types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  req.user = { sub: 'local-dev-user', email: 'dev@localhost', role: 'admin', iat: 0, exp: 0 };
  next();
}

export function requireRole(..._roles: string[]) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  };
}

export function optionalAuth(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

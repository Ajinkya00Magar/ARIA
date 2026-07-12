// ─────────────────────────────────────────────────────────────────────────────
// Global Error Handler
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { isAppError, toApiError } from '@ibm-agent/shared';
import { createLogger } from '../lib/logger';

const logger = createLogger('error-handler');

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (isAppError(err)) {
    if (err.statusCode >= 500) {
      logger.error({ err, url: req.url, method: req.method }, 'Application error');
    }
    res.status(err.statusCode).json({
      success: false,
      error: toApiError(err),
    });
    return;
  }

  // Unknown/unexpected errors
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled error');

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : String(err),
    },
  });
}

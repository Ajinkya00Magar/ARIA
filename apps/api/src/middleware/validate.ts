// ─────────────────────────────────────────────────────────────────────────────
// Zod Validation Middleware
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '@ibm-agent/shared';

export function validate<T>(
  schema: ZodSchema<T>,
  source: 'body' | 'query' | 'params' = 'body',
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      req[source] = parsed as typeof req[typeof source];
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.reduce(
          (acc, issue) => {
            const path = issue.path.join('.');
            acc[path] = issue.message;
            return acc;
          },
          {} as Record<string, string>,
        );
        next(new ValidationError('Validation failed', details));
      } else {
        next(err);
      }
    }
  };
}

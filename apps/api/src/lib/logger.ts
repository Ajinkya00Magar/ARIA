// ─────────────────────────────────────────────────────────────────────────────
// Server-side Pino Logger
// ─────────────────────────────────────────────────────────────────────────────

import pino, { Logger as PinoLogger } from 'pino';
import { env } from './env';

const base = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        }
      : undefined,
  base: { service: 'ibm-coding-agent-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

export function createLogger(component: string): PinoLogger {
  return base.child({ component });
}

export { base as rootLogger };

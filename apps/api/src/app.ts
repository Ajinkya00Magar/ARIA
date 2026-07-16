// ─────────────────────────────────────────────────────────────────────────────
// Express Application Factory
// ─────────────────────────────────────────────────────────────────────────────

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import { env } from './lib/env';
import { createLogger } from './lib/logger';
import { errorHandler } from './middleware/error-handler';
import { authRouter } from './routes/auth';
import { workspaceRouter } from './routes/workspace';
import { chatRouter } from './routes/chat';
import { agentRouter } from './routes/agent';
import { terminalRouter } from './routes/terminal';
import { gitRouter } from './routes/git';
import { filesRouter } from './routes/files';
import { taskRouter, settingsRouter, metricsRouter } from './routes/tasks';
import { systemRouter } from './routes/system';
import { RATE_LIMITS } from '@ibm-agent/shared';

const logger = createLogger('app');

export function createApp(): Application {
  const app = express();

  // ── Security ───────────────────────────────────────────────────────────────

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", ...env.ALLOWED_ORIGINS],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    cors({
      origin: env.ALLOWED_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }),
  );

  // ── Middleware ─────────────────────────────────────────────────────────────

  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser(env.JWT_SECRET));

  // Request logging
  app.use(
    pinoHttp({
      logger,
      customLogLevel: (_req, res) => {
        if (res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // Global rate limiting
  app.use(
    '/api',
    rateLimit({
      windowMs: RATE_LIMITS.api.windowMs,
      max: RATE_LIMITS.api.max,
      message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Auth rate limit (stricter)
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: RATE_LIMITS.auth.windowMs,
      max: RATE_LIMITS.auth.max,
      message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many auth attempts' } },
    }),
  );

  // ── Health ─────────────────────────────────────────────────────────────────

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      version: process.env.npm_package_version ?? '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.get('/ready', (_req: Request, res: Response) => {
    res.json({ status: 'ready' });
  });

  // ── API Routes ─────────────────────────────────────────────────────────────

  app.use('/api/auth', authRouter);
  app.use('/api/workspaces', workspaceRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/agent', agentRouter);
  app.use('/api/terminal', terminalRouter);
  app.use('/api/git', gitRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/tasks', taskRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/metrics', metricsRouter);
  app.use('/api/system', systemRouter);

  // ── 404 Handler ────────────────────────────────────────────────────────────

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
    });
  });

  // ── Error Handler ──────────────────────────────────────────────────────────

  app.use(errorHandler);

  return app;
}

// Dummy default export to appease Vercel's Serverless Function scanner,
// which attempts to parse every file in the `dist` folder.
export default function dummy() {}

// ─────────────────────────────────────────────────────────────────────────────
// ARIA API — Entry Point
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { createApp } from './app';
import { connectDatabase } from './db/connection';
import { createLogger } from './lib/logger';
import { env } from './lib/env';
import { Server as SocketServer } from 'socket.io';
import { initTerminalSockets } from './lib/terminal-socket';

const logger = createLogger('server');

async function main() {
  // Connect to database (SQLite local / PostgreSQL production)
  await connectDatabase();
  logger.info('Database connected');

  const app = createApp();
  const port = env.PORT;

  const server = app.listen(port, () => {
    logger.info({ port, env: env.NODE_ENV, version: process.env.npm_package_version ?? '1.0.0' }, 'ARIA API running');
  });

  const io = new SocketServer(server, {
    cors: {
      origin: env.ALLOWED_ORIGINS,
    },
  });

  initTerminalSockets(io);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Trigger restart

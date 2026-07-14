// ─────────────────────────────────────────────────────────────────────────────
// IBM Coding Agent API — Entry Point
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { createApp } from './app';
import { connectDatabase } from './db/connection';
import { createLogger } from './lib/logger';
import { env } from './lib/env';
import { Server as SocketServer } from 'socket.io';
import { initTerminalSockets } from './lib/terminal-socket';

const logger = createLogger('server');
const app = createApp();

let dbConnected = false;

// In serverless environments, we must ensure the DB is connected before handling requests
app.use(async (req, res, next) => {
  if (!dbConnected) {
    try {
      await connectDatabase();
      dbConnected = true;
      logger.info('Database connected (serverless)');
    } catch (err) {
      logger.error('Failed to connect to database in serverless mode', err);
    }
  }
  next();
});

async function main() {
  // Connect to PostgreSQL / SQLite
  await connectDatabase();
  dbConnected = true;
  logger.info('Database connected');

  const port = env.PORT || 3001;

  const server = app.listen(port, () => {
    logger.info({ port, env: env.NODE_ENV, version: process.env.npm_package_version ?? '1.0.0' }, 'IBM Coding Agent API running');
  });

  const io = new SocketServer(server, {
    cors: {
      origin: '*', // We'll want to restrict this in production
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

// If we are NOT in Vercel, start the server normally with app.listen()
if (process.env.VERCEL !== '1') {
  main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

// Export the app for Vercel Serverless Functions
module.exports = app;

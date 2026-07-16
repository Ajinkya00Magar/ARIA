// ─────────────────────────────────────────────────────────────────────────────
// IBM Coding Agent API — Entry Point
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import { createApp } from './app';
import { createLogger } from './lib/logger';
import { env } from './lib/env';

const logger = createLogger('server');
const app = createApp();

async function main() {
  const port = env.PORT || 3001;

  const server = app.listen(port as number, '127.0.0.1', () => {
    logger.info({ port, env: env.NODE_ENV, version: process.env.npm_package_version ?? '1.0.0' }, 'IBM Coding Agent API running on 127.0.0.1');
  });

  // Terminal sockets are disabled for Serverless compatibility.

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
    logger.error({ err }, 'Uncaught exception in API');
    // We don't process.exit(1) here because the Electron main process
    // should handle the error dialog and graceful exit.
  });
}

// If we are NOT in a Serverless environment, start the server normally
const isServerless = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_VERSION;
if (!isServerless && require.main === module) {
  main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

// Export the app for Vercel Serverless Functions
module.exports = app;

// Trigger Vercel deployment

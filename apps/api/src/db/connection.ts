// ─────────────────────────────────────────────────────────────────────────────
// Database Connection — Drizzle + SQLite
// ─────────────────────────────────────────────────────────────────────────────

import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from 'path';
import { env } from '../lib/env';
import * as schema from './schema';
import { createLogger } from '../lib/logger';

const logger = createLogger('database');

let sqlite: Database.Database | null = null;
let db: BetterSQLite3Database<typeof schema> | null = null;

export async function connectDatabase(): Promise<void> {
  const isVercel = process.env.VERCEL === '1';
  const dbPath = isVercel 
    ? path.join('/tmp', 'local.db')
    : path.resolve(process.cwd(), 'local.db');
  sqlite = new Database(dbPath, {
    verbose: (message) => logger.debug(message),
  });

  db = drizzle(sqlite, { schema });
  logger.info(`Database connected at ${dbPath}`);
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!db) throw new Error('Database not initialized. Call connectDatabase() first.');
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (sqlite) {
    sqlite.close();
    logger.info('Database closed');
  }
}

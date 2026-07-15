// ─────────────────────────────────────────────────────────────────────────────
// Database Connection — Drizzle + PostgreSQL
// ─────────────────────────────────────────────────────────────────────────────

import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../lib/env';
import * as schema from './schema';
import { createLogger } from '../lib/logger';

const logger = createLogger('database');

let queryClient: postgres.Sql | null = null;
let db: PostgresJsDatabase<typeof schema> | null = null;

export async function connectDatabase(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  
  queryClient = postgres(connectionString, {
    max: 10,
    onnotice: (notice) => logger.debug(notice.message),
  });

  db = drizzle(queryClient, { schema });
  logger.info('Connected to PostgreSQL database');
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!db) throw new Error('Database not initialized. Call connectDatabase() first.');
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (queryClient) {
    await queryClient.end();
    logger.info('Database connection closed');
  }
}

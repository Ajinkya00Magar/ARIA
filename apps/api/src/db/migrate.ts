// ─────────────────────────────────────────────────────────────────────────────
// Database Migration Script — PostgreSQL
// ─────────────────────────────────────────────────────────────────────────────

import { env } from '../lib/env';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate as runMigration } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'path';

const __dirname_resolved = __dirname;

async function migrate() {
  try {
    console.log('Running database migrations...');

    const connectionString = env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }

    // This single connection is just for running migrations
    const migrationClient = postgres(connectionString, { max: 1 });
    const db = drizzle(migrationClient);

    const migrationsDir = path.join(__dirname_resolved, '../../migrations');
    
    await runMigration(db, { migrationsFolder: migrationsDir });

    console.log('✅ All migrations complete');
    await migrationClient.end();
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate().catch(console.error);

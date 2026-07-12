// ─────────────────────────────────────────────────────────────────────────────
// Database Migration Script
// ─────────────────────────────────────────────────────────────────────────────

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate as runMigration } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import path from 'path';

const __dirname_resolved = __dirname;

async function migrate() {
  try {
    console.log('Running database migrations...');

    const dbPath = path.resolve(process.cwd(), 'local.db');
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite);

    const migrationsDir = path.join(__dirname_resolved, '../../migrations');
    
    runMigration(db, { migrationsFolder: migrationsDir });

    console.log('✅ All migrations complete');
    sqlite.close();
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate().catch(console.error);

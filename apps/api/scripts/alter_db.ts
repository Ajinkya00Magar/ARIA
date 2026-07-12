import '../src/lib/env';
import { getDb, connectDatabase } from '../src/db/connection';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    await connectDatabase();
    const db = getDb();
    await db.execute(sql`ALTER TABLE terminal_sessions ADD COLUMN output jsonb DEFAULT '[]';`);
    console.log('Successfully altered table terminal_sessions');
  } catch (err) {
    console.error('Failed to alter table:', err);
  }
  process.exit(0);
}

run();

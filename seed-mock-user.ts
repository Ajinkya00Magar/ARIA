import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from 'path';
import { users } from './apps/api/src/db/schema';

async function seedUser() {
  const dbPath = path.resolve(process.cwd(), 'apps/api/local.db');
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);

  console.log('Inserting local-dev-user...');
  await db.insert(users).values({
    id: 'local-dev-user',
    email: 'dev@localhost',
    name: 'Local Developer',
    role: 'admin',
    provider: 'local',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }).onConflictDoNothing();
  
  console.log('✅ Done');
  sqlite.close();
}

seedUser().catch(console.error);

// ─────────────────────────────────────────────────────────────────────────────
// Database Seed Script — Creates initial admin user and sample workspace
// ─────────────────────────────────────────────────────────────────────────────

import '../lib/env';
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from 'path';
import { users, userSettings } from './schema';
import { eq } from 'drizzle-orm';

async function seed() {
  const dbPath = path.resolve(process.cwd(), 'local.db');
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);

  try {
    console.log('Seeding database...');

    const passwordHash = await bcrypt.hash('Admin@123456!', 12);

    // Check if admin user already exists
    const existingAdmin = db.select().from(users).where(eq(users.email, 'admin@ibm-agent.local')).get();

    if (!existingAdmin) {
      db.insert(users).values({
        email: 'admin@ibm-agent.local',
        name: 'Admin User',
        passwordHash,
        role: 'admin',
        provider: 'local',
      }).run();

      const newAdmin = db.select().from(users).where(eq(users.email, 'admin@ibm-agent.local')).get();
      if (newAdmin) {
        db.insert(userSettings).values({
          userId: newAdmin.id,
        }).run();
        console.log('✅ Admin user created: admin@ibm-agent.local / Admin@123456!');
      }
    } else {
      console.log('ℹ️ Admin user already exists.');
    }

  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    sqlite.close();
  }
}

seed().catch(console.error);


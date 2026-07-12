// ─────────────────────────────────────────────────────────────────────────────
// Database Seed Script — Creates initial admin user and sample workspace
// ─────────────────────────────────────────────────────────────────────────────

import '../lib/env';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

async function seed() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('Seeding database...');

    // Create admin user
    const adminId = randomUUID();
    const passwordHash = await bcrypt.hash('Admin@123456!', 12);

    await pool.query(
      `INSERT INTO users (id, email, name, password_hash, role, provider)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING`,
      [adminId, 'admin@ibm-agent.local', 'Admin User', passwordHash, 'admin', 'local'],
    );

    // Create default settings for admin
    await pool.query(
      `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [adminId],
    );

    console.log('✅ Admin user created: admin@ibm-agent.local / Admin@123456!');
    console.log('⚠️  Change the password immediately after first login!');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed().catch(console.error);

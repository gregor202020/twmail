#!/usr/bin/env node
/**
 * Seed script to create the initial admin user.
 *
 * Usage:
 *   npx tsx packages/api/src/seed-admin.ts
 *   # or from packages/api:
 *   npm run seed:admin
 *
 * Environment: DATABASE_URL must be set.
 *
 * Prompts (or uses defaults):
 *   --email    admin@twmail.local
 *   --name     Admin
 *   --password admin123
 */
import { getDb, destroyDb } from '@twmail/shared';
import bcrypt from 'bcrypt';
import { UserRole } from '@twmail/shared';

const BCRYPT_ROUNDS = 12;

async function main() {
  const args = process.argv.slice(2);
  function getArg(flag: string, fallback: string): string {
    const idx = args.indexOf(flag);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1]!;
    return fallback;
  }

  const email: string = getArg('--email', 'admin@twmail.local');
  const name: string = getArg('--name', 'Admin');
  const password: string = getArg('--password', 'admin123');

  const db = getDb();

  // Check if user already exists
  const existing = await db.selectFrom('users')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirst();

  if (existing) {
    console.log(`User "${email}" already exists (id=${existing.id}). Skipping.`);
    await destroyDb();
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await db.insertInto('users')
    .values({
      email,
      name,
      password_hash: passwordHash,
      role: UserRole.ADMIN,
    })
    .returning(['id', 'email', 'name', 'role'])
    .executeTakeFirstOrThrow();

  console.log(`Admin user created:`);
  console.log(`  ID:    ${user.id}`);
  console.log(`  Email: ${user.email}`);
  console.log(`  Name:  ${user.name}`);
  console.log(`  Role:  Admin`);
  console.log(`  Pass:  ${password}`);

  await destroyDb();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

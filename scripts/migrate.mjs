#!/usr/bin/env node

/**
 * migrate.mjs — Simple migration runner for Third Wave Mail.
 *
 * Reads all .sql files from db/migrations/ in alphabetical order and
 * executes them against the DATABASE_URL PostgreSQL connection.
 *
 * Usage:
 *   DATABASE_URL=postgres://user:pass@localhost:5432/twmail node scripts/migrate.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'db', 'migrations');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('Connected to database.');

    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id       SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Get already-applied migrations
    const { rows: applied } = await client.query(
      'SELECT filename FROM _migrations ORDER BY filename'
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    // Read migration files in order
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    let ranCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  SKIP  ${file} (already applied)`);
        continue;
      }

      const filePath = join(MIGRATIONS_DIR, file);
      const sql = await readFile(filePath, 'utf-8');

      console.log(`  RUN   ${file} ...`);
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [file]
        );
        console.log(`  OK    ${file}`);
        ranCount++;
      } catch (err) {
        console.error(`  FAIL  ${file}`);
        console.error(err.message);
        process.exit(1);
      }
    }

    console.log(
      ranCount > 0
        ? `\nDone. Applied ${ranCount} migration(s).`
        : '\nAll migrations already applied.'
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});

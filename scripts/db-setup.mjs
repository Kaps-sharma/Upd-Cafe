#!/usr/bin/env node
/**
 * Create or reset the Supabase database.
 *
 *   npm run db:setup            apply supabase/schema.sql (safe to re-run)
 *   npm run db:setup -- --reset wipe every table first, then re-apply
 *
 * Reads DATABASE_URL from .env.local (or the environment). Nothing is printed
 * that could leak the connection string.
 */

import { loadEnv, createPool, readRepoFile } from './lib/env.mjs';

const reset = process.argv.includes('--reset');
const env = loadEnv();
const databaseUrl = env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error('\nDATABASE_URL is missing.');
  console.error('Copy .env.example to .env.local and add the Supabase session-pooler URI.\n');
  process.exit(1);
}

if (databaseUrl.includes(':6543/')) {
  console.error('\nDATABASE_URL uses port 6543 (transaction pooler).');
  console.error('Use the session pooler on port 5432 instead.\n');
  process.exit(1);
}

const pool = createPool(databaseUrl);

try {
  console.log('\nConnecting to Supabase...');
  await pool.query('SELECT 1');
  console.log('Connected.');

  if (reset) {
    console.log('\nResetting: dropping every table...');
    await pool.query(readRepoFile('supabase/reset.sql'));
    console.log('  done - all data removed.');
  }

  console.log(`\nApplying supabase/schema.sql${reset ? '' : ' (idempotent)'}...`);
  await pool.query(readRepoFile('supabase/schema.sql'));

  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );
  const names = tables.rows.map((row) => row.table_name);
  console.log(`  done - ${names.length} table(s): ${names.join(', ')}`);

  console.log('\nDatabase is ready.');
  console.log('Next: npm run check:db   (health check)');
  console.log('      npm run seed:demo  (optional demo accounts + orders)\n');
} catch (error) {
  console.error('\nDatabase setup failed.');
  console.error(String(error?.message ?? error));
  if (/password authentication failed/i.test(String(error?.message))) {
    console.error('Check the password in DATABASE_URL (Supabase -> Settings -> Database).');
  }
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}

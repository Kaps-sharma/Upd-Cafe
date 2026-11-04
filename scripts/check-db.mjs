#!/usr/bin/env node
/**
 * Snake Cafe - database & auth health check
 *
 *   node scripts/check-db.mjs
 *
 * Reads .env.local, then verifies:
 *   1. the env vars are present and shaped correctly
 *   2. Postgres accepts the connection
 *   3. every table from supabase/schema.sql exists
 *   4. the starter menu + settings are seeded
 *   5. member ID/password columns exist and accounts are stored hashed
 *
 * Secrets are never printed.
 */

import { loadEnv, createPool } from './lib/env.mjs';

const TABLES = [
  'members',
  'menu_items',
  'orders',
  'coin_transactions',
  'bookings',
  'game_limits',
  'game_sessions',
  'settings',
];

let failures = 0;

function ok(label, extra = '') {
  console.log(`  [ok]   ${label}${extra ? `  ${extra}` : ''}`);
}
function bad(label, extra = '') {
  failures += 1;
  console.log(`  [FAIL] ${label}${extra ? `  ${extra}` : ''}`);
}
function warn(label, extra = '') {
  console.log(`  [warn] ${label}${extra ? `  ${extra}` : ''}`);
}
function head(title) {
  console.log(`\n${title}`);
}

const env = loadEnv();

// ---------------------------------------------------------------- 1. env vars
head('1. Environment');

const databaseUrl = env.DATABASE_URL;
const sessionSecret = env.SNAKE_CAFE_SECRET?.trim();

if (!databaseUrl) {
  bad('DATABASE_URL is missing', '- add it to .env.local');
} else {
  ok('DATABASE_URL is set');
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) bad('DATABASE_URL does not start with postgres://');
  else ok('DATABASE_URL scheme', 'postgres://');

  if (databaseUrl.includes(':6543/')) {
    bad('DATABASE_URL uses port 6543 (transaction pooler)', '- use the session pooler on port 5432');
  } else if (databaseUrl.includes(':5432/')) {
    ok('DATABASE_URL port', '5432 (session pooler)');
  } else {
    warn('DATABASE_URL port is not 5432', '- the session pooler is the safe choice');
  }

  if (!databaseUrl.includes('pooler.supabase.com')) {
    warn('DATABASE_URL is not a pooler host', '- pooler.supabase.com works on IPv4-only networks');
  } else {
    ok('DATABASE_URL host', 'pooler.supabase.com');
  }
}

if (!sessionSecret) {
  warn('SNAKE_CAFE_SECRET is missing', '- dev uses a fallback; set a long random string in production');
} else if (sessionSecret.length < 16) {
  warn('SNAKE_CAFE_SECRET is short', '- use at least 32 random characters');
} else {
  ok('SNAKE_CAFE_SECRET is set');
}

// --------------------------------------------------------------- 2. connection
head('2. Postgres connection');

let pool = null;
if (databaseUrl) {
  pool = createPool(databaseUrl);

  try {
    const res = await pool.query('SELECT version()');
    const version = String(res.rows[0]?.version ?? '').split(' on ')[0];
    ok('connected', version);
  } catch (error) {
    const message = String(error?.message ?? error);
    if (/password authentication failed/i.test(message)) {
      bad('password authentication failed', '- reset it in Supabase -> Settings -> Database');
    } else if (/ENOTFOUND|EAI_AGAIN/i.test(message)) {
      bad('host not found', '- check the region in DATABASE_URL');
    } else if (/timeout|ECONNREFUSED|ETIMEDOUT/i.test(message)) {
      bad('connection timed out', '- try the session pooler (port 5432) instead of the direct connection');
    } else {
      bad('could not connect', message);
    }
  }
}

// ------------------------------------------------------------------- 3. tables
head('3. Tables');

if (pool) {
  try {
    const res = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const existing = new Set(res.rows.map((r) => r.table_name));
    for (const table of TABLES) {
      if (existing.has(table)) ok(`table ${table}`);
      else bad(`table ${table} is missing`, '- run supabase/schema.sql in the SQL Editor');
    }
  } catch (error) {
    bad('could not list tables', String(error?.message ?? error));
  }

  // ------------------------------------------------------------- 4. seed data
  head('4. Seed data');
  try {
    const menu = await pool.query('SELECT count(*)::int AS n FROM menu_items');
    const n = menu.rows[0]?.n ?? 0;
    if (n > 0) ok('menu is seeded', `${n} item(s)`);
    else warn('menu is empty', '- it seeds itself the first time the app boots');

    const settings = await pool.query('SELECT count(*)::int AS n FROM settings');
    const s = settings.rows[0]?.n ?? 0;
    if (s > 0) ok('settings are seeded', `${s} row(s)`);
    else warn('settings are empty', '- they seed themselves the first time the app boots');
  } catch (error) {
    warn('could not read seed data', String(error?.message ?? error));
  }
}

// ------------------------------------------------------------ 5. Member logins
head('5. Member logins');

if (pool) {
  try {
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'members'
          AND column_name IN ('username','password_hash','consent_at')`
    );
    const names = new Set(cols.rows.map((r) => r.column_name));
    if (names.has('username') && names.has('password_hash') && names.has('consent_at')) {
      ok('members table has username + password_hash + consent_at');
    } else {
      bad('members table is missing login or consent columns', '- run the latest supabase/schema.sql');
    }

    const accounts = await pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE username IS NOT NULL AND password_hash <> '')::int AS ready
         FROM members`
    );
    const total = accounts.rows[0]?.total ?? 0;
    const ready = accounts.rows[0]?.ready ?? 0;
    if (ready > 0) {
      ok('member accounts ready to log in', `${ready} of ${total}`);
    } else {
      warn('no member accounts yet', '- create one from /login');
    }

    const plain = await pool.query(
      `SELECT count(*)::int AS n FROM members
        WHERE password_hash <> '' AND password_hash NOT LIKE '%:%'`
    );
    if ((plain.rows[0]?.n ?? 0) === 0) {
      ok('all stored passwords use the salted hash format');
    } else {
      bad('some passwords are not salted hashes', '- reset those accounts from /login');
    }
  } catch (error) {
    warn('could not inspect member logins', String(error?.message ?? error));
  }
}

if (pool) await pool.end().catch(() => {});

// ----------------------------------------------------------------- summary
console.log('');
if (failures === 0) {
  console.log('ALL GOOD - your database is ready.\n');
  process.exit(0);
} else {
  console.log(`${failures} problem(s) found. Fix the [FAIL] lines above.\n`);
  process.exit(1);
}

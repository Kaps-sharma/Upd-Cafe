/**
 * Shared helpers for the Node scripts in this folder.
 *
 * They deliberately use only Node built-ins plus `pg`, so `npm run db:setup`
 * and `npm run seed:demo` work before Next.js has built anything.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/** Project root: two levels up from scripts/lib/env.mjs. */
export const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** Minimal .env parser - avoids needing a dotenv dependency. */
export function loadEnvFile(file) {
  const out = {};
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** process.env with `.env.local` layered on top (the file wins, as in Next.js). */
export function loadEnv() {
  return { ...process.env, ...loadEnvFile(join(root, '.env.local')) };
}

/**
 * Open a single-connection pool for a script.
 * `pg` on Supabase needs TLS; the pooler certificate is not in Node's trust
 * store, so verification is relaxed the same way `lib/db.ts` does it.
 */
export function createPool(connectionString) {
  return new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 15_000,
    ssl: { rejectUnauthorized: false },
  });
}

/** Read a file from the repo, with a helpful error if the path is wrong. */
export function readRepoFile(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

import 'server-only';
import { Pool, type QueryResult, type PoolClient } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { MENU_SEED } from '@/lib/menu';
import { MAX_GAME_TURNS, GAME_COOLDOWN_MS } from '@/lib/games';
import { SC_PER_RUPEE } from '@/lib/store';
import { TABLES, TIME_SLOTS, SLOT_STARTS, MAX_SEATS, MAX_BOOKING_DAYS } from '@/lib/tables';
import type { MemberPublic, StoreSettings, MenuItem } from '@/lib/store';

export type Member = MemberPublic;

export interface InvoiceItem {
  name: string;
  price: number;
  quantity: number;
}

export interface Invoice {
  id: number;
  timestamp: string;
  orderDetails: string;
  total: number;
  scUsed: number;
  items: InvoiceItem[] | null;
}

export interface BookingInvoice {
  id: number;
  bookingNo: string;
  tableNumber: string;
  tableLabel: string;
  capacity: number;
  seats: number;
  date: string;
  slotId: string;
  slotLabel: string;
  memberName: string;
  timestamp: string;
}

export interface GameSession {
  id: number;
  member_id: number;
  game: string;
  secret: number | null;
  moves: number;
  status: string;
}

export class InsufficientBalanceError extends Error {
  amountNeeded: number;
  constructor(amountNeeded: number) {
    super(`Insufficient balance! You need ₹${amountNeeded.toFixed(2)} more.`);
    this.amountNeeded = amountNeeded;
  }
}

export class MenuItemError extends Error {}

export class MemberProfileError extends Error {}

export class BookingError extends Error {}

// ---------------------------------------------------------------------------
// Engine abstraction: two backends with the same async API.
// - Local: SQLite file via node:sqlite (used on dev/machines with a disk).
// - Remote: PostgreSQL via node-postgres (used on serverless hosts).
// ---------------------------------------------------------------------------

interface StmtResult {
  lastInsertRowid: number | bigint;
  changes: number;
}

interface Backend {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<StmtResult>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(work: (tx: Backend) => Promise<T>): Promise<T>;
}

const SETTING_DEFAULTS: Record<string, string> = {
  store_name: 'Snake Cafe',
  currency_name: 'Snake Coins',
  currency_symbol: 'SC',
  welcome_bonus: '20',
};

const PASSSCODE_SECRET = process.env.SNAKE_CAFE_SECRET ?? 'snake-cafe-dev-secret-change-me';

export function hashPasscode(passcode: string): string {
  return createHash('sha256').update(`${PASSSCODE_SECRET}::${passcode}`).digest('hex');
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS Members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    money REAL NOT NULL DEFAULT 0,
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    upi_id TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS GameLimits (
    member_id INTEGER NOT NULL,
    game TEXT NOT NULL,
    plays INTEGER NOT NULL DEFAULT 0,
    cooldown_until INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (member_id, game),
    FOREIGN KEY(member_id) REFERENCES Members(id)
  );

  CREATE TABLE IF NOT EXISTS Transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    order_details TEXT NOT NULL,
    total REAL NOT NULL,
    sc_used REAL NOT NULL DEFAULT 0,
    items_json TEXT NOT NULL DEFAULT '[]',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(member_id) REFERENCES Members(id)
  );

  CREATE TABLE IF NOT EXISTS GameSessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    game TEXT NOT NULL,
    secret INTEGER,
    moves INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(member_id) REFERENCES Members(id)
  );

  CREATE TABLE IF NOT EXISTS Bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    table_number TEXT NOT NULL,
    table_label TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    seats INTEGER NOT NULL,
    date TEXT NOT NULL,
    slot_id TEXT NOT NULL,
    slot_label TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(member_id) REFERENCES Members(id)
  );

  CREATE TABLE IF NOT EXISTS Settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS MenuItems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    price REAL NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    image TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
  );
`;

// ----------------------- PostgreSQL (Supabase) schema -----------------------

const PG_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS Members (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    balance DOUBLE PRECISION NOT NULL DEFAULT 0,
    money DOUBLE PRECISION NOT NULL DEFAULT 0,
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    upi_id TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS GameLimits (
    member_id INTEGER NOT NULL,
    game TEXT NOT NULL,
    plays INTEGER NOT NULL DEFAULT 0,
    cooldown_until BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (member_id, game),
    FOREIGN KEY(member_id) REFERENCES Members(id)
  );

  CREATE TABLE IF NOT EXISTS Transactions (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL,
    order_details TEXT NOT NULL,
    total DOUBLE PRECISION NOT NULL,
    sc_used DOUBLE PRECISION NOT NULL DEFAULT 0,
    items_json TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(member_id) REFERENCES Members(id)
  );

  CREATE TABLE IF NOT EXISTS GameSessions (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL,
    game TEXT NOT NULL,
    secret INTEGER,
    moves INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(member_id) REFERENCES Members(id)
  );

  CREATE TABLE IF NOT EXISTS Bookings (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL,
    table_number TEXT NOT NULL,
    table_label TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    seats INTEGER NOT NULL,
    date TEXT NOT NULL,
    slot_id TEXT NOT NULL,
    slot_label TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(member_id) REFERENCES Members(id)
  );

  CREATE TABLE IF NOT EXISTS Settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS MenuItems (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    image TEXT NOT NULL DEFAULT '',
    active SMALLINT NOT NULL DEFAULT 1
  );
`;

// ----------------------------- Local backend ------------------------------

function resolveDataDir(): string {
  const cwdDir = path.join(process.cwd(), 'data');
  try {
    fs.mkdirSync(cwdDir, { recursive: true });
    fs.accessSync(cwdDir, fs.constants.W_OK);
    return cwdDir;
  } catch {
    return path.join(os.tmpdir(), 'snake_cafe_data');
  }
}

const DATA_DIR = resolveDataDir();
const DB_PATH = path.join(DATA_DIR, 'snake_cafe.db');

type LocalDb = InstanceType<typeof import('node:sqlite')['DatabaseSync']>;

let localDb: LocalDb | null = null;

let nodeSqlitePromise: Promise<typeof import('node:sqlite')> | null = null;

function loadNodeSqlite(): Promise<typeof import('node:sqlite')> {
  if (!nodeSqlitePromise) {
    nodeSqlitePromise = import('node:sqlite').catch((cause: unknown) => {
      nodeSqlitePromise = null;
      throw new Error(
        'This runtime does not support the built-in Node.js SQLite module (node:sqlite). ' +
          'Use Node 22.5+ locally, or on the host set DATABASE_URL and TURSO_AUTH_TOKEN to use a Turso database.',
        { cause }
      );
    });
  }
  return nodeSqlitePromise;
}

async function localDatabase(): Promise<LocalDb> {
  if (!localDb) {
    const mod = await loadNodeSqlite();
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    localDb = new mod.DatabaseSync(DB_PATH);
    localDb.exec(SCHEMA_SQL);
    ensureMenuImageColumnSync();
    seedSettingsSync();
    ensureMoneyColumnSync();
    ensureProfileColumnsSync();
    ensureInvoiceColumnsSync();
    seedMenuSync();
  }
  return localDb;
}

async function localRun(sql: string, params: unknown[] = []): Promise<StmtResult> {
  const result = (await localDatabase()).prepare(sql).run(...(params as never[]));
  return { lastInsertRowid: Number(result.lastInsertRowid), changes: Number(result.changes) };
}

async function localGet<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await localDatabase()).prepare(sql).get(...(params as never[])) as T | undefined;
}

async function localAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await localDatabase()).prepare(sql).all(...(params as never[])) as T[];
}

async function localExec(sql: string): Promise<void> {
  (await localDatabase()).exec(sql);
}

// Serialize transactions on the single local connection so concurrent requests
// can't interleave BEGIN/COMMIT blocks.
let localTxChain: Promise<unknown> = Promise.resolve();

async function localTransaction<T>(work: (tx: Backend) => Promise<T>): Promise<T> {
  const run = localTxChain.then(async () => {
    const db = await localDatabase();
    db.exec('BEGIN');
    const tx: Backend = {
      exec: localExec,
      run: localRun,
      get: localGet,
      all: localAll,
      transaction: localTransaction,
    };
    try {
      const result = await work(tx);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  localTxChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

// ----------------------- Remote (Supabase / PostgreSQL) --------------------

function isRemote(): boolean {
  const url = process.env.DATABASE_URL;
  return typeof url === 'string' && url.length > 0 && /^(postgres|postgresql):\/\//.test(url);
}

let pgPool: Pool | null = null;
let pgInit: Promise<void> | null = null;

function getPool(): Pool {
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pgPool;
}

// node-postgres uses $1..$n placeholders; our SQL uses SQLite-style `?`.
function toPgQuery(sql: string, params: unknown[]): { text: string; values: unknown[] } {
  if (params.length === 0) return { text: sql, values: [] };
  let index = 0;
  const text = sql.replace(/\?/g, () => `$${++index}`);
  return { text, values: params };
}

async function pgQuery(
  source: Pool | PoolClient,
  text: string,
  values: unknown[] = []
): Promise<QueryResult> {
  // With no bound params use the simple query protocol so multi-statement SQL works.
  return values.length === 0
    ? source.query(text)
    : source.query(text, values as never[]);
}

async function ensurePgReady(): Promise<void> {
  if (!pgInit) {
    pgInit = initPg();
  }
  await pgInit;
}

async function initPg(): Promise<void> {
  const pool = getPool();
  await pgQuery(pool, PG_SCHEMA_SQL);
  await ensurePgMenuImageColumn(pool);
  await seedPgSettings(pool);
  await ensurePgMoneyColumn(pool);
  await ensurePgProfileColumns(pool);
  await ensurePgInvoiceColumns(pool);
  await seedPgMenu(pool);
}

async function pgTableColumns(pool: Pool, table: string): Promise<string[]> {
  const res = await pgQuery(
    pool,
    'SELECT column_name FROM information_schema.columns WHERE table_name = lower($1)',
    [table]
  );
  return res.rows.map((r) => String((r as { column_name: unknown }).column_name));
}

async function pgExec(sql: string): Promise<void> {
  await ensurePgReady();
  await pgQuery(getPool(), sql);
}

async function pgRun(sql: string, params: unknown[] = []): Promise<StmtResult> {
  await ensurePgReady();
  const q = toPgQuery(sql, params);
  const queryText =
    /^\s*INSERT/i.test(q.text) && !/RETURNING/i.test(q.text)
      ? `${q.text} RETURNING id`
      : q.text;
  const res = await pgQuery(getPool(), queryText, q.values);
  const first = res.rows[0] as { id?: number | bigint } | undefined;
  return {
    lastInsertRowid: first && first.id !== undefined ? Number(first.id) : 0,
    changes: res.rowCount ?? 0,
  };
}

async function pgGet<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  await ensurePgReady();
  const q = toPgQuery(sql, params);
  const res = await pgQuery(getPool(), q.text, q.values);
  return res.rows[0] as T | undefined;
}

async function pgAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ensurePgReady();
  const q = toPgQuery(sql, params);
  const res = await pgQuery(getPool(), q.text, q.values);
  return res.rows as T[];
}

async function pgTransaction<T>(work: (tx: Backend) => Promise<T>): Promise<T> {
  await ensurePgReady();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const adapter: Backend = {
      exec: async (sql) => {
        await pgQuery(client, sql);
      },
      run: async (sql, params = []) => {
        const q = toPgQuery(sql, params);
        const queryText =
          /^\s*INSERT/i.test(q.text) && !/RETURNING/i.test(q.text)
            ? `${q.text} RETURNING id`
            : q.text;
        const res = await pgQuery(client, queryText, q.values);
        const first = res.rows[0] as { id?: number | bigint } | undefined;
        return {
          lastInsertRowid: first && first.id !== undefined ? Number(first.id) : 0,
          changes: res.rowCount ?? 0,
        };
      },
      get: async <T2 = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        const q = toPgQuery(sql, params);
        const res = await pgQuery(client, q.text, q.values);
        return res.rows[0] as T2 | undefined;
      },
      all: async <T2 = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        const q = toPgQuery(sql, params);
        const res = await pgQuery(client, q.text, q.values);
        return res.rows as T2[];
      },
      transaction: pgTransaction,
    };
    const result = await work(adapter);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function ensurePgMenuImageColumn(pool: Pool): Promise<void> {
  const columns = await pgTableColumns(pool, 'MenuItems');
  if (!columns.includes('image')) {
    await pgQuery(pool, `ALTER TABLE MenuItems ADD COLUMN image TEXT NOT NULL DEFAULT ''`);
  }
  for (const item of MENU_SEED) {
    if (item.image) {
      await pgQuery(
        pool,
        `UPDATE MenuItems SET image = $1 WHERE name = $2 AND (image IS NULL OR image = '')`,
        [item.image, item.name]
      );
    }
  }
}

async function seedPgSettings(pool: Pool): Promise<void> {
  const defaultPasscode = process.env.SNAKE_CAFE_ADMIN_PASSCODE ?? 'admin123';
  const defaults: Record<string, string> = {
    ...SETTING_DEFAULTS,
    admin_passcode_hash: hashPasscode(defaultPasscode),
  };
  for (const [key, value] of Object.entries(defaults)) {
    await pgQuery(pool, 'INSERT INTO Settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [
      key,
      value,
    ]);
  }
}

async function ensurePgMoneyColumn(pool: Pool): Promise<void> {
  const columns = await pgTableColumns(pool, 'Members');
  if (!columns.includes('money')) {
    await pgQuery(pool, `ALTER TABLE Members ADD COLUMN money DOUBLE PRECISION NOT NULL DEFAULT 0`);
  }
  const row = await pgQuery(pool, 'SELECT value FROM Settings WHERE key = $1', ['welcome_bonus']);
  const welcome =
    (row.rows[0] as { value?: string } | undefined)?.value ?? SETTING_DEFAULTS.welcome_bonus;
  await pgQuery(pool, 'UPDATE Members SET money = $1 WHERE money IS NULL OR money = 0', [Number(welcome)]);
}

async function ensurePgProfileColumns(pool: Pool): Promise<void> {
  const columns = await pgTableColumns(pool, 'Members');
  for (const col of ['phone', 'address', 'upi_id'] as const) {
    if (!columns.includes(col)) {
      await pgQuery(pool, `ALTER TABLE Members ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
  }
}

async function ensurePgInvoiceColumns(pool: Pool): Promise<void> {
  const columns = await pgTableColumns(pool, 'Transactions');
  if (!columns.includes('sc_used')) {
    await pgQuery(pool, `ALTER TABLE Transactions ADD COLUMN sc_used DOUBLE PRECISION NOT NULL DEFAULT 0`);
  }
  if (!columns.includes('items_json')) {
    await pgQuery(pool, `ALTER TABLE Transactions ADD COLUMN items_json TEXT NOT NULL DEFAULT '[]'`);
  }
}

async function seedPgMenu(pool: Pool): Promise<void> {
  const res = await pgQuery(pool, 'SELECT COUNT(*) AS n FROM MenuItems');
  const n = (res.rows[0] as { n?: unknown } | undefined)?.n;
  if (Number(n ?? 0) > 0) return;
  for (const item of MENU_SEED) {
    await pgQuery(
      pool,
      'INSERT INTO MenuItems (name, price, category, image) VALUES ($1, $2, $3, $4)',
      [item.name, item.price, item.category, item.image]
    );
  }
}

async function getPgSetting(key: string): Promise<string | null> {
  const row = await pgGet<{ value: string }>('SELECT value FROM Settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

// ----------------------------- Local migration helpers --------------------

function ensureMenuImageColumnSync(): void {
  if (!localDb) return;
  const columns = localDb.prepare('PRAGMA table_info(MenuItems)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'image')) {
    localDb.exec(`ALTER TABLE MenuItems ADD COLUMN image TEXT NOT NULL DEFAULT ''`);
  }
  const backfill = localDb.prepare(
    `UPDATE MenuItems SET image = ? WHERE name = ? AND (image IS NULL OR image = '')`
  );
  for (const item of MENU_SEED) {
    if (item.image) backfill.run(item.image, item.name);
  }
}

function seedSettingsSync(): void {
  if (!localDb) return;
  const defaultPasscode = process.env.SNAKE_CAFE_ADMIN_PASSCODE ?? 'admin123';
  const existing = new Set(
    (localDb.prepare('SELECT key FROM Settings').all() as { key: string }[]).map((r) => r.key)
  );
  const defaults: Record<string, string> = {
    ...SETTING_DEFAULTS,
    admin_passcode_hash: hashPasscode(defaultPasscode),
  };
  const insert = localDb.prepare('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaults)) {
    if (!existing.has(key)) insert.run(key, value);
  }
}

function ensureMoneyColumnSync(): void {
  if (!localDb) return;
  const columns = localDb.prepare('PRAGMA table_info(Members)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'money')) {
    localDb.exec(`ALTER TABLE Members ADD COLUMN money REAL NOT NULL DEFAULT 0`);
  }
  const welcome = getSettingSync('welcome_bonus') ?? SETTING_DEFAULTS.welcome_bonus;
  localDb.prepare('UPDATE Members SET money = ? WHERE money IS NULL OR money = 0').run(Number(welcome));
}

function ensureProfileColumnsSync(): void {
  if (!localDb) return;
  const columns = localDb.prepare('PRAGMA table_info(Members)').all() as { name: string }[];
  for (const col of ['phone', 'address', 'upi_id'] as const) {
    if (!columns.some((c) => c.name === col)) {
      localDb.exec(`ALTER TABLE Members ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
  }
}

function ensureInvoiceColumnsSync(): void {
  if (!localDb) return;
  const columns = localDb.prepare('PRAGMA table_info(Transactions)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'sc_used')) {
    localDb.exec(`ALTER TABLE Transactions ADD COLUMN sc_used REAL NOT NULL DEFAULT 0`);
  }
  if (!columns.some((c) => c.name === 'items_json')) {
    localDb.exec(`ALTER TABLE Transactions ADD COLUMN items_json TEXT NOT NULL DEFAULT '[]'`);
  }
}

function seedMenuSync(): void {
  if (!localDb) return;
  const count = (localDb.prepare('SELECT COUNT(*) AS n FROM MenuItems').get() as { n: number }).n;
  if (count > 0) return;
  const insert = localDb.prepare(
    'INSERT INTO MenuItems (name, price, category, image, active) VALUES (?, ?, ?, ?, 1)'
  );
  for (const item of MENU_SEED) {
    insert.run(item.name, item.price, item.category, item.image);
  }
}

function getSettingSync(key: string): string | null {
  if (!localDb) return null;
  const row = localDb.prepare('SELECT value FROM Settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

// ----------------------------- Facade ------------------------------

export function getDb(): Backend {
  if (isRemote()) {
    return {
      exec: pgExec,
      run: pgRun,
      get: pgGet,
      all: pgAll,
      transaction: pgTransaction,
    };
  }
  return {
    exec: localExec,
    run: localRun,
    get: localGet,
    all: localAll,
    transaction: localTransaction,
  };
}

// ---- Game turn limits ----

interface GameLimitState {
  allowed: boolean;
  cooldown: boolean;
  retryAfterMs: number | null;
  attemptsLeft: number;
}

async function readGameLimit(memberId: number, game: string): Promise<{ plays: number; cooldown_until: number }> {
  const row = await getDb().get<{ plays: number; cooldown_until: number }>(
    'SELECT plays, cooldown_until FROM GameLimits WHERE member_id = ? AND game = ?',
    [memberId, game]
  );
  return { plays: row?.plays ?? 0, cooldown_until: Number(row?.cooldown_until ?? 0) };
}

async function writeGameLimit(memberId: number, game: string, plays: number, cooldownUntil: number): Promise<void> {
  await getDb().run(
    `INSERT INTO GameLimits (member_id, game, plays, cooldown_until) VALUES (?, ?, ?, ?)
     ON CONFLICT(member_id, game) DO UPDATE SET
       plays = excluded.plays,
       cooldown_until = excluded.cooldown_until`,
    [memberId, game, plays, cooldownUntil]
  );
}

function gameLimitState(plays: number, cooldownUntil: number, now: number): GameLimitState {
  if (cooldownUntil > now) {
    return { allowed: false, cooldown: true, retryAfterMs: cooldownUntil, attemptsLeft: 0 };
  }
  return { allowed: true, cooldown: false, retryAfterMs: null, attemptsLeft: MAX_GAME_TURNS - plays };
}

/** Read-only view of how many turns a member has left (does not consume a turn). */
export async function getGameState(memberId: number, game: string): Promise<GameLimitState> {
  const { plays, cooldown_until } = await readGameLimit(memberId, game);
  return gameLimitState(plays, cooldown_until, Date.now());
}

/**
 * Record the outcome of one game session.
 * - Losing consumes one of the 3 daily tries; the 3rd loss starts a 24h cooldown.
 * - Winning starts the 24h cooldown immediately, even on the 1st or 2nd try.
 */
export async function recordGameOutcome(memberId: number, game: string, won: boolean): Promise<GameLimitState> {
  const now = Date.now();
  const { plays, cooldown_until } = await readGameLimit(memberId, game);
  if (cooldown_until > now) {
    return gameLimitState(plays, cooldown_until, now);
  }

  if (won) {
    await writeGameLimit(memberId, game, 0, now + GAME_COOLDOWN_MS);
    return { allowed: false, cooldown: true, retryAfterMs: now + GAME_COOLDOWN_MS, attemptsLeft: 0 };
  }

  if (plays + 1 >= MAX_GAME_TURNS) {
    await writeGameLimit(memberId, game, 0, now + GAME_COOLDOWN_MS);
    return { allowed: false, cooldown: true, retryAfterMs: now + GAME_COOLDOWN_MS, attemptsLeft: 0 };
  }

  await writeGameLimit(memberId, game, plays + 1, 0);
  return { allowed: true, cooldown: false, retryAfterMs: null, attemptsLeft: MAX_GAME_TURNS - (plays + 1) };
}

// ---- Settings ----

export async function getSetting(key: string): Promise<string | null> {
  if (isRemote()) return getPgSetting(key);
  await localDatabase();
  return getSettingSync(key);
}

export async function setSetting(key: string, value: string): Promise<void> {
  await getDb().run('INSERT INTO Settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
    key,
    value,
  ]);
}

export async function getStoreSettings(): Promise<StoreSettings> {
  return {
    storeName: (await getSetting('store_name')) ?? SETTING_DEFAULTS.store_name,
    currencyName: (await getSetting('currency_name')) ?? SETTING_DEFAULTS.currency_name,
    currencySymbol: (await getSetting('currency_symbol')) ?? SETTING_DEFAULTS.currency_symbol,
    welcomeBonus: Number((await getSetting('welcome_bonus')) ?? SETTING_DEFAULTS.welcome_bonus),
  };
}

export async function passcodeMatches(passcode: string): Promise<boolean> {
  const stored = await getSetting('admin_passcode_hash');
  if (!stored) return false;
  const candidate = hashPasscode(passcode);
  if (stored.length !== candidate.length) return false;
  return timingSafeEqual(Buffer.from(stored, 'utf8'), Buffer.from(candidate, 'utf8'));
}

export async function setAdminPasscode(passcode: string): Promise<void> {
  await setSetting('admin_passcode_hash', hashPasscode(passcode));
}

// ---- Members ----

interface MemberRow {
  id: number;
  name: string;
  balance: number;
  money: number;
  phone: string;
  address: string;
  upi_id: string;
}

function rowToMember(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    sc: row.balance,
    money: row.money,
    phone: row.phone ?? '',
    address: row.address ?? '',
    upiId: row.upi_id ?? '',
  };
}

const MEMBER_COLUMNS = 'id, name, balance, money, phone, address, upi_id';

export async function getMember(id: number): Promise<Member | null> {
  const row = await getDb().get<MemberRow>(`SELECT ${MEMBER_COLUMNS} FROM Members WHERE id = ?`, [id]);
  return row ? rowToMember(row) : null;
}

export async function findMemberByName(name: string): Promise<Member | null> {
  const row = await getDb().get<MemberRow>(`SELECT ${MEMBER_COLUMNS} FROM Members WHERE name = ?`, [name]);
  return row ? rowToMember(row) : null;
}

export async function createMember(name: string, welcomeMoney: number): Promise<Member> {
  const result = await getDb().run('INSERT INTO Members (name, balance, money) VALUES (?, 0, ?)', [
    name,
    welcomeMoney,
  ]);
  return {
    id: Number(result.lastInsertRowid),
    name,
    sc: 0,
    money: welcomeMoney,
    phone: '',
    address: '',
    upiId: '',
  };
}

export async function updateMemberProfile(
  memberId: number,
  updates: Partial<{ name: string; phone: string; address: string; upiId: string }>
): Promise<Member | null> {
  const current = await getMember(memberId);
  if (!current) return null;

  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  const phone = updates.phone !== undefined ? updates.phone.trim() : current.phone;
  const address = updates.address !== undefined ? updates.address.trim() : current.address;
  const upiId = updates.upiId !== undefined ? updates.upiId.trim() : current.upiId;

  if (!name || name.length > 40) {
    throw new MemberProfileError('Name must be between 1 and 40 characters.');
  }
  if (phone && !/^\d{10}$/.test(phone)) {
    throw new MemberProfileError('Phone number must be exactly 10 digits (e.g. 9876543210).');
  }
  if (phone.length > 20) {
    throw new MemberProfileError('Phone number is too long.');
  }
  if (address.length > 300) {
    throw new MemberProfileError('Address must be 300 characters or fewer.');
  }
  if (upiId.length > 60) {
    throw new MemberProfileError('UPI ID must be 60 characters or fewer.');
  }

  if (name !== current.name) {
    const clash = await findMemberByName(name);
    if (clash && clash.id !== memberId) {
      throw new MemberProfileError(`The name "${name}" is already taken by another member.`);
    }
  }

  await getDb().run('UPDATE Members SET name = ?, phone = ?, address = ?, upi_id = ? WHERE id = ?', [
    name,
    phone,
    address,
    upiId,
    memberId,
  ]);
  return getMember(memberId);
}

export async function addMoney(memberId: number, amount: number): Promise<number> {
  return getDb().transaction(async (db) => {
    const current = await db.get<{ money: number }>('SELECT money FROM Members WHERE id = ?', [memberId]);
    if (!current) throw new Error('Member not found');
    const newMoney = Math.round((current.money + amount) * 100) / 100;
    await db.run('UPDATE Members SET money = ? WHERE id = ?', [newMoney, memberId]);
    return newMoney;
  });
}

// ---- Orders ----

export async function placeOrder(
  memberId: number,
  items: { name: string; quantity: number }[],
  scUsed: number
) {
  return getDb().transaction(async (db) => {
    const rows = await db.all<{ name: string; price: number }>(
      'SELECT name, price FROM MenuItems WHERE active = 1'
    );
    const priceMap = new Map(rows.map((r) => [r.name, r.price]));

    let total = 0;
    const detailItems: { name: string; price: number; quantity: number }[] = [];
    const detailsParts: string[] = [];
    for (const item of items) {
      const price = priceMap.get(item.name);
      if (price === undefined) {
        throw new MenuItemError(`"${item.name}" is not on the menu. Try again.`);
      }
      total += price * item.quantity;
      detailItems.push({ name: item.name, price, quantity: item.quantity });
      detailsParts.push(`${item.name} x${item.quantity}`);
    }
    if (total <= 0) throw new MenuItemError('Your order is empty.');
    const details = detailsParts.join(', ');

    const spentSc = Number.isFinite(scUsed) ? Math.floor(Math.max(0, scUsed)) : 0;
    const discount = Math.round((spentSc / SC_PER_RUPEE) * 100) / 100;
    if (discount > total) {
      throw new MenuItemError('You applied more Snake Coins than the order total.');
    }
    const amountToPay = Math.round((total - discount) * 100) / 100;

    const member = await db.get<{ balance: number; money: number }>('SELECT balance, money FROM Members WHERE id = ?', [
      memberId,
    ]);
    if (!member) throw new Error('Member not found');

    if (spentSc > 0 && spentSc > member.balance) {
      throw new MenuItemError(`You only have ${member.balance.toFixed(0)} Snake Coins.`);
    }
    if (member.money < amountToPay) {
      throw new InsufficientBalanceError(Math.round((amountToPay - member.money) * 100) / 100);
    }

    const newMoney = Math.round((member.money - amountToPay) * 100) / 100;
    const newSc = Math.round((member.balance - spentSc) * 100) / 100;
    await db.run('UPDATE Members SET money = ?, balance = ? WHERE id = ?', [newMoney, newSc, memberId]);
    const inserted = await db.run(
      'INSERT INTO Transactions (member_id, order_details, total, sc_used, items_json) VALUES (?, ?, ?, ?, ?)',
      [memberId, details, amountToPay, spentSc, JSON.stringify(detailItems)]
    );
    return {
      orderId: Number(inserted.lastInsertRowid),
      items: detailItems,
      total,
      discount,
      scUsed: spentSc,
      amountPaid: amountToPay,
      details,
      newMoney,
      newSc,
    };
  });
}

export async function creditReward(memberId: number, amount: number): Promise<number> {
  return getDb().transaction(async (db) => {
    const current = await db.get<{ balance: number }>('SELECT balance FROM Members WHERE id = ?', [memberId]);
    if (!current) throw new Error('Member not found');
    const newBalance = current.balance + amount;
    await db.run('UPDATE Members SET balance = ? WHERE id = ?', [newBalance, memberId]);
    return newBalance;
  });
}

export async function getTransactions(memberId: number): Promise<Invoice[]> {
  const rows = await getDb().all<{
    id: number;
    timestamp: string;
    order_details: string;
    total: number;
    sc_used: number;
    items_json: string;
  }>(
    'SELECT id, timestamp, order_details, total, sc_used, items_json FROM Transactions WHERE member_id = ? ORDER BY timestamp DESC, id DESC',
    [memberId]
  );
  return rows.map((r) => {
    let items: InvoiceItem[] | null = null;
    try {
      const parsed = JSON.parse(r.items_json || '[]');
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (i: unknown) =>
            typeof i === 'object' &&
            i !== null &&
            'name' in (i as Record<string, unknown>) &&
            'price' in (i as Record<string, unknown>) &&
            'quantity' in (i as Record<string, unknown>)
        )
      ) {
        items = parsed as InvoiceItem[];
      }
    } catch {
      items = null;
    }
    return {
      id: r.id,
      timestamp: fmtTs(r.timestamp),
      orderDetails: r.order_details,
      total: r.total,
      scUsed: r.sc_used ?? 0,
      items,
    };
  });
}

// ---- Table bookings ----

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayKey(): string {
  return localDateKey(new Date());
}

function maxDateKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + MAX_BOOKING_DAYS);
  return localDateKey(d);
}

function currentTimeKey(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type BookingRow = {
  id: number;
  member_name: string;
  table_number: string;
  table_label: string;
  capacity: number;
  seats: number;
  date: string;
  slot_id: string;
  slot_label: string;
  created_at: string;
};

function fmtTs(value: unknown): string {
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(
      value.getHours()
    )}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  return String(value ?? '');
}

function rowToBooking(row: BookingRow): BookingInvoice {
  return {
    id: row.id,
    bookingNo: `B-${String(row.id).padStart(4, '0')}`,
    tableNumber: row.table_number,
    tableLabel: row.table_label,
    capacity: row.capacity,
    seats: row.seats,
    date: row.date,
    slotId: row.slot_id,
    slotLabel: row.slot_label,
    memberName: row.member_name,
    timestamp: fmtTs(row.created_at),
  };
}

export async function getTableAvailability(date: string) {
  const rows = await getDb().all<{ slot_id: string; table_number: string }>(
    'SELECT slot_id, table_number FROM Bookings WHERE date = ?',
    [date]
  );
  const booked: Record<string, string[]> = {};
  for (const row of rows) {
    if (!booked[row.slot_id]) booked[row.slot_id] = [];
    booked[row.slot_id].push(row.table_number);
  }
  const today = todayKey();
  const now = currentTimeKey();
  const slots = TIME_SLOTS.map((s) => ({
    id: s.id,
    label: s.label,
    disabled: date === today && SLOT_STARTS[s.id] <= now,
  }));
  return { date, maxDate: maxDateKey(), slots, booked };
}

export async function getMemberBookings(memberId: number): Promise<BookingInvoice[]> {
  const rows = await getDb().all<BookingRow>(
    `SELECT b.id, b.table_number, b.table_label, b.capacity, b.seats, b.date, b.slot_id, b.slot_label,
            b.created_at, m.name AS member_name
     FROM Bookings b JOIN Members m ON m.id = b.member_id
     WHERE b.member_id = ?
     ORDER BY b.date DESC, b.id DESC`,
    [memberId]
  );
  return rows.map(rowToBooking);
}

export async function createBooking(
  memberId: number,
  memberName: string,
  params: { date?: unknown; slot?: unknown; table?: unknown; seats?: unknown }
): Promise<BookingInvoice> {
  const date = typeof params.date === 'string' ? params.date : '';
  const slotId = typeof params.slot === 'string' ? params.slot : '';
  const tableId = typeof params.table === 'string' ? params.table : '';
  const seats = typeof params.seats === 'number' ? Math.floor(params.seats) : NaN;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BookingError('Pick a valid date.');
  }
  const today = todayKey();
  const maxDate = maxDateKey();
  if (date < today) throw new BookingError(`You can't book a table in the past.`);
  if (date > maxDate) throw new BookingError(`Bookings are open up to ${MAX_BOOKING_DAYS} days ahead.`);
  if (date.length !== 10) throw new BookingError('Pick a valid date.');

  const slot = TIME_SLOTS.find((s) => s.id === slotId);
  if (!slot) throw new BookingError('Pick a valid time slot.');
  if (date === today && SLOT_STARTS[slotId] <= currentTimeKey()) {
    throw new BookingError('That time has already passed today. Pick another slot.');
  }

  const table = TABLES.find((t) => t.id === tableId);
  if (!table) throw new BookingError('Pick a table from the layout.');
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) {
    throw new BookingError(`Pick how many seats you need (1–${MAX_SEATS}).`);
  }
  if (seats > table.capacity) {
    throw new BookingError(`Table ${table.label} seats only ${table.capacity} people. Pick a bigger table.`);
  }

  const db = getDb();
  const clash = await db.get<{ id: number }>(
    'SELECT id FROM Bookings WHERE date = ? AND slot_id = ? AND table_number = ?',
    [date, slotId, tableId]
  );
  if (clash) {
    throw new BookingError(`Table ${table.label} is already booked for ${slot.label}.`);
  }
  const mine = await db.get<{ id: number }>(
    'SELECT id FROM Bookings WHERE member_id = ? AND date = ? AND slot_id = ?',
    [memberId, date, slotId]
  );
  if (mine) {
    throw new BookingError('You already have a table booked at this date and time.');
  }

  const inserted = await db.run(
    'INSERT INTO Bookings (member_id, table_number, table_label, capacity, seats, date, slot_id, slot_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [memberId, table.id, table.label, table.capacity, seats, date, slot.id, slot.label]
  );
  const row = await db.get<BookingRow>(
    `SELECT b.id, b.table_number, b.table_label, b.capacity, b.seats, b.date, b.slot_id, b.slot_label,
            b.created_at, ? AS member_name
     FROM Bookings b WHERE b.id = ?`,
    [memberName, Number(inserted.lastInsertRowid)]
  );
  return rowToBooking(row as BookingRow);
}

// ---- Menu items ----

function rowToMenuItem(row: {
  id: number;
  name: string;
  price: number;
  category: string;
  image: string;
  active: number;
}): MenuItem {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    category: row.category,
    image: row.image ?? '',
    active: row.active === 1,
  };
}

export async function listMenuItems(): Promise<MenuItem[]> {
  const rows = await getDb().all<{
    id: number;
    name: string;
    price: number;
    category: string;
    image: string;
    active: number;
  }>('SELECT id, name, price, category, image, active FROM MenuItems ORDER BY category, name');
  return rows.map(rowToMenuItem);
}

export async function getActiveMenuItems(): Promise<MenuItem[]> {
  return (await listMenuItems()).filter((item) => item.active);
}

export async function getMenuItemByName(name: string): Promise<MenuItem | null> {
  const row = await getDb().get<{
    id: number;
    name: string;
    price: number;
    category: string;
    image: string;
    active: number;
  }>('SELECT id, name, price, category, image, active FROM MenuItems WHERE name = ?', [name]);
  return row ? rowToMenuItem(row) : null;
}

export async function createMenuItem(data: { name: string; price: number; category: string; image?: string }): Promise<MenuItem> {
  const name = data.name.trim();
  const price = Number(data.price);
  const category = data.category.trim() || 'General';
  const image = (data.image ?? '').trim();

  if (!name || name.length > 40) {
    throw new MenuItemError('Item name must be between 1 and 40 characters.');
  }
  if (!Number.isFinite(price) || price <= 0) {
    throw new MenuItemError('Price must be a positive number.');
  }
  if (category.length > 30) {
    throw new MenuItemError('Category must be 30 characters or fewer.');
  }
  if (image.length > 500) {
    throw new MenuItemError('Image URL must be 500 characters or fewer.');
  }
  if (await getMenuItemByName(name)) {
    throw new MenuItemError(`An item named "${name}" already exists.`);
  }

  const result = await getDb().run('INSERT INTO MenuItems (name, price, category, image) VALUES (?, ?, ?, ?)', [
    name,
    price,
    category,
    image,
  ]);
  return { id: Number(result.lastInsertRowid), name, price, category, image, active: true };
}

export async function updateMenuItem(
  id: number,
  data: Partial<{ name: string; price: number; category: string; image: string; active: boolean }>
): Promise<MenuItem | null> {
  const current = await getMenuItemById(id);
  if (!current) return null;

  const next = {
    name: data.name !== undefined ? data.name.trim() : current.name,
    price: data.price !== undefined ? Number(data.price) : current.price,
    category: data.category !== undefined ? data.category.trim() || 'General' : current.category,
    image: data.image !== undefined ? data.image.trim() : current.image,
    active: data.active !== undefined ? data.active : current.active,
  };

  if (!next.name || next.name.length > 40) {
    throw new MenuItemError('Item name must be between 1 and 40 characters.');
  }
  if (!Number.isFinite(next.price) || next.price <= 0) {
    throw new MenuItemError('Price must be a positive number.');
  }
  if (next.category.length > 30) {
    throw new MenuItemError('Category must be 30 characters or fewer.');
  }
  if (next.image.length > 500) {
    throw new MenuItemError('Image URL must be 500 characters or fewer.');
  }

  const clash = await getMenuItemByName(next.name);
  if (clash && clash.id !== id) {
    throw new MenuItemError(`An item named "${next.name}" already exists.`);
  }

  await getDb().run('UPDATE MenuItems SET name = ?, price = ?, category = ?, image = ?, active = ? WHERE id = ?', [
    next.name,
    next.price,
    next.category,
    next.image,
    next.active ? 1 : 0,
    id,
  ]);
  return getMenuItemById(id);
}

export async function deleteMenuItem(id: number): Promise<boolean> {
  const result = await getDb().run('DELETE FROM MenuItems WHERE id = ?', [id]);
  return Number(result.changes) > 0;
}

export async function getMenuItemById(id: number): Promise<MenuItem | null> {
  const row = await getDb().get<{
    id: number;
    name: string;
    price: number;
    category: string;
    image: string;
    active: number;
  }>('SELECT id, name, price, category, image, active FROM MenuItems WHERE id = ?', [id]);
  return row ? rowToMenuItem(row) : null;
}

// ---- Game sessions ----

export async function createGameSession(memberId: number, game: string, secret?: number): Promise<GameSession> {
  const result = await getDb().run('INSERT INTO GameSessions (member_id, game, secret) VALUES (?, ?, ?)', [
    memberId,
    game,
    secret ?? null,
  ]);
  return {
    id: Number(result.lastInsertRowid),
    member_id: memberId,
    game,
    secret: secret ?? null,
    moves: 0,
    status: 'active',
  };
}

export async function getGameSession(id: number): Promise<GameSession | null> {
  const row = await getDb().get<{
    id: number;
    member_id: number;
    game: string;
    secret: number | null;
    moves: number;
    status: string;
  }>('SELECT id, member_id, game, secret, moves, status FROM GameSessions WHERE id = ?', [id]);
  if (!row) return null;
  return {
    id: row.id,
    member_id: row.member_id,
    game: row.game,
    secret: row.secret,
    moves: row.moves,
    status: row.status,
  };
}

export async function updateSessionMoves(id: number, moves: number): Promise<void> {
  await getDb().run('UPDATE GameSessions SET moves = ? WHERE id = ?', [moves, id]);
}

export async function finishGameSession(id: number, status: 'won' | 'lost' | 'abandoned'): Promise<void> {
  await getDb().run('UPDATE GameSessions SET status = ? WHERE id = ?', [status, id]);
}
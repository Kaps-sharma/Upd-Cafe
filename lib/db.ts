import 'server-only';
import { Pool, types, type PoolClient } from 'pg';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { MENU_SEED } from '@/lib/menu';
import { MAX_GAME_TURNS, GAME_COOLDOWN_MS } from '@/lib/games';
import { SC_PER_RUPEE } from '@/lib/store';
import {
  DEFAULT_TIME_ZONE,
  addDaysToDateKey,
  dateKeyInZone,
  isValidDateKey,
  isValidTimeZone,
  timeKeyInZone,
} from '@/lib/time';
import { TABLES, TIME_SLOTS, SLOT_STARTS, MAX_SEATS, MAX_BOOKING_DAYS } from '@/lib/tables';
import type { MemberPublic, StoreSettings, MenuItem } from '@/lib/store';
import {
  ORDER_STATUS_LABEL,
  canTransition,
  isOrderStatus,
  isOrderType,
  orderNo,
  type Order,
  type OrderLine,
  type OrderStatus,
  type OrderType,
} from '@/lib/orders';

// Postgres sends NUMERIC and BIGINT as strings so nothing is silently rounded.
// We want plain JS numbers for money maths, so convert them on the way in.
types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // NUMERIC
types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // BIGINT

export type Member = MemberPublic;

export type { Order, OrderLine, OrderStatus, OrderType };

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
  status: string;
  timestamp: string;
}

export interface GameSession {
  id: number;
  member_id: number;
  game: string;
  secret: number | null;
  board: string;
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

export class AdminError extends Error {}

export class BookingError extends Error {}

export class OrderError extends Error {}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

let pool: Pool | null = null;

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return typeof url === 'string' && url.trim().length > 0;
}

function getPool(): Pool {
  if (!pool) {
    if (!isDatabaseConfigured()) {
      throw new Error(
        'DATABASE_URL is not set. Copy .env.example to .env.local and add your Supabase connection string.'
      );
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      // Supabase requires TLS. The pooler and direct connections both work with this.
      ssl: { rejectUnauthorized: false },
    });
    pool.on('error', (error) => {
      console.error('[db] unexpected postgres error:', error.message);
    });
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export interface Db {
  rows<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | undefined>;
  exec(text: string, params?: unknown[]): Promise<number>;
}

function dbFor(executor: Pool | PoolClient): Db {
  return {
    async rows<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const res = await executor.query(text, params as never[]);
      return res.rows as T[];
    },
    async one<T>(text: string, params: unknown[] = []): Promise<T | undefined> {
      const res = await executor.query(text, params as never[]);
      return res.rows[0] as T | undefined;
    },
    async exec(text: string, params: unknown[] = []): Promise<number> {
      const res = await executor.query(text, params as never[]);
      return res.rowCount ?? 0;
    },
  };
}

let dbCache: Db | null = null;

function db(): Db {
  if (!dbCache) dbCache = dbFor(getPool());
  return dbCache;
}

/** Run `work` inside a real Postgres transaction (BEGIN / COMMIT / ROLLBACK). */
export async function transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(dbFor(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// First-run seeding
//
// The schema lives in supabase/schema.sql. All this does is insert the rows
// that have to exist for the app to boot: default settings and the starter
// menu. Both are idempotent, so restarting never duplicates anything and
// never overwrites something the admin edited.
// ---------------------------------------------------------------------------

const SETTING_DEFAULTS: Record<string, string> = {
  store_name: 'Snake Cafe',
  currency_name: 'Snake Coins',
  currency_symbol: 'SC',
  welcome_bonus: '20',
  timezone: 'Asia/Kolkata',
  max_discount_percent: '50',
  gst_percent: '0',
  fssai_number: '',
  gstin: '',
  invoice_note: '',
};

let seedPromise: Promise<void> | null = null;

function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const defaultPasscode = process.env.SNAKE_CAFE_ADMIN_PASSCODE ?? 'admin123';
      const defaults: Record<string, string> = {
        ...SETTING_DEFAULTS,
        admin_passcode_hash: hashSecret(defaultPasscode),
      };
      for (const [key, value] of Object.entries(defaults)) {
        await db().exec(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
          [key, value]
        );
      }
      for (const item of MENU_SEED) {
        await db().exec(
          `INSERT INTO menu_items (name, price, category, image)
           VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING`,
          [item.name, item.price, item.category, item.image]
        );
      }

      // Older databases stored the passcode as a plain SHA-256 hash. Replace
      // that with the scrypt format so the admin panel stays reachable.
      const stored = await db().one<{ value: string }>(
        'SELECT value FROM settings WHERE key = $1',
        ['admin_passcode_hash']
      );
      if (!stored?.value?.includes(':')) {
        await db().exec(
          `INSERT INTO settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
          ['admin_passcode_hash', hashSecret(defaultPasscode)]
        );
      }
    })().catch((error: unknown) => {
      seedPromise = null; // allow a retry on the next request
      if (isMissingTable(error)) {
        throw new Error(
          'Database tables are missing. Run supabase/schema.sql in the Supabase SQL Editor, then reload.'
        );
      }
      throw error;
    });
  }
  return seedPromise;
}

/** Wait for the seed to finish, then hand back the query helpers. */
async function ready(): Promise<Db> {
  await ensureSeeded();
  return db();
}

function isMissingTable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === '42P01'
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === '23505'
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

// ---------------------------------------------------------------------------
// Admin passcode (scrypt, salted per hash)
// ---------------------------------------------------------------------------

const SECRET_KEY_BYTES = 64;

/** Hash a password or passcode with a per-hash random salt. */
export function hashSecret(secret: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(secret, salt, SECRET_KEY_BYTES).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(secret, salt, SECRET_KEY_BYTES);
  const expectedBuf = Buffer.from(expected, 'hex');
  if (actual.length !== expectedBuf.length) return false;
  return timingSafeEqual(actual, expectedBuf);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSetting(key: string): Promise<string | null> {
  const row = await (await ready()).one<{ value: string }>(
    'SELECT value FROM settings WHERE key = $1',
    [key]
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await (await ready()).exec(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

export async function getStoreSettings(): Promise<StoreSettings> {
  const d = await ready();
  const rows = await d.rows<{ key: string; value: string }>(
    'SELECT key, value FROM settings WHERE key = ANY($1::text[])',
    [Object.keys(SETTING_DEFAULTS)]
  );
  const values = new Map(rows.map((r) => [r.key, r.value]));
  const read = (key: string, fallback: string) => values.get(key) ?? fallback;
  return {
    storeName: read('store_name', SETTING_DEFAULTS.store_name),
    currencyName: read('currency_name', SETTING_DEFAULTS.currency_name),
    currencySymbol: read('currency_symbol', SETTING_DEFAULTS.currency_symbol),
    welcomeBonus: Number(read('welcome_bonus', SETTING_DEFAULTS.welcome_bonus)),
    timezone: read('timezone', DEFAULT_TIME_ZONE),
    maxDiscountPercent: clampPercent(
      Number(read('max_discount_percent', SETTING_DEFAULTS.max_discount_percent))
    ),
    gstPercent: clampGst(Number(read('gst_percent', SETTING_DEFAULTS.gst_percent))),
    fssaiNumber: read('fssai_number', SETTING_DEFAULTS.fssai_number).trim(),
    gstin: read('gstin', SETTING_DEFAULTS.gstin).trim().toUpperCase(),
    invoiceNote: read('invoice_note', SETTING_DEFAULTS.invoice_note).trim(),
  };
}

/** Keep an admin-entered percentage inside 0–100. */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** GST rates may carry decimals (e.g. 5.5), so keep two places instead of rounding. */
function clampGst(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(50, Math.max(0, round2(value)));
}

export async function passcodeMatches(passcode: string): Promise<boolean> {
  const stored = await getSetting('admin_passcode_hash');
  if (!stored) return false;
  return verifySecret(passcode, stored);
}

export async function setAdminPasscode(passcode: string): Promise<void> {
  await setSetting('admin_passcode_hash', hashSecret(passcode));
}

// ---------------------------------------------------------------------------
// Admin login throttling
//
// After ADMIN_MAX_ATTEMPTS wrong passcodes the panel locks for
// ADMIN_LOCK_MINUTES. The counters live in `settings`, so restarting the app
// (or a serverless cold start) does not wipe the lockout.
// ---------------------------------------------------------------------------

const ADMIN_MAX_ATTEMPTS = 5;
const ADMIN_LOCK_MS = 15 * 60 * 1000;

export interface AdminLoginState {
  locked: boolean;
  retryAfterMs: number;
  attemptsLeft: number;
}

export async function adminLoginState(): Promise<AdminLoginState> {
  const rows = await (
    await ready()
  ).rows<{ key: string; value: string }>(
    'SELECT key, value FROM settings WHERE key = ANY($1::text[])',
    [['admin_failed_attempts', 'admin_locked_until']]
  );
  const values = new Map(rows.map((r) => [r.key, r.value]));
  const lockedUntil = Number(values.get('admin_locked_until') ?? 0);
  const failed = Number(values.get('admin_failed_attempts') ?? 0);
  const now = Date.now();

  if (lockedUntil > now) {
    return {
      locked: true,
      retryAfterMs: lockedUntil - now,
      attemptsLeft: 0,
    };
  }
  if (lockedUntil) {
    // The lock expired; start with a clean slate.
    await Promise.all([
      setSetting('admin_failed_attempts', '0'),
      setSetting('admin_locked_until', '0'),
    ]);
    return { locked: false, retryAfterMs: 0, attemptsLeft: ADMIN_MAX_ATTEMPTS };
  }
  return {
    locked: false,
    retryAfterMs: 0,
    attemptsLeft: Math.max(0, ADMIN_MAX_ATTEMPTS - failed),
  };
}

/** Record one wrong passcode and lock the panel once the limit is reached. */
export async function registerAdminFailure(): Promise<AdminLoginState> {
  const current = await adminLoginState();
  if (current.locked) return current;

  const failed = ADMIN_MAX_ATTEMPTS - current.attemptsLeft + 1;
  if (failed >= ADMIN_MAX_ATTEMPTS) {
    const until = Date.now() + ADMIN_LOCK_MS;
    await Promise.all([
      setSetting('admin_failed_attempts', '0'),
      setSetting('admin_locked_until', String(until)),
    ]);
    return { locked: true, retryAfterMs: ADMIN_LOCK_MS, attemptsLeft: 0 };
  }

  await setSetting('admin_failed_attempts', String(failed));
  return {
    locked: false,
    retryAfterMs: 0,
    attemptsLeft: ADMIN_MAX_ATTEMPTS - failed,
  };
}

export async function clearAdminFailures(): Promise<void> {
  await Promise.all([
    setSetting('admin_failed_attempts', '0'),
    setSetting('admin_locked_until', '0'),
  ]);
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

interface MemberRow {
  id: number;
  username: string | null;
  name: string;
  money: number;
  sc: number;
  phone: string;
  address: string;
  upi_id: string;
}

function rowToMember(row: MemberRow): Member {
  return {
    id: row.id,
    username: row.username ?? '',
    name: row.name,
    sc: Number(row.sc ?? 0),
    money: Number(row.money ?? 0),
    phone: row.phone ?? '',
    address: row.address ?? '',
    upiId: row.upi_id ?? '',
  };
}

const MEMBER_COLUMNS = 'id, username, name, money, sc, phone, address, upi_id';

export async function getMember(id: number): Promise<Member | null> {
  const row = await (await ready()).one<MemberRow>(
    `SELECT ${MEMBER_COLUMNS} FROM members WHERE id = $1`,
    [id]
  );
  return row ? rowToMember(row) : null;
}

export async function findMemberByName(name: string): Promise<Member | null> {
  const row = await (await ready()).one<MemberRow>(
    `SELECT ${MEMBER_COLUMNS} FROM members WHERE name = $1`,
    [name]
  );
  return row ? rowToMember(row) : null;
}

export class MemberAuthError extends Error {}

const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

/** Create a member account. `username` is the member ID used to log in. */
export async function createMemberAccount(
  username: string,
  password: string,
  welcomeMoney: number,
  consent: boolean
): Promise<Member> {
  const cleanUsername = username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(cleanUsername)) {
    throw new MemberAuthError(
      'Member ID must be 3–30 characters using letters, numbers, dots, dashes or underscores.'
    );
  }
  if (password.length < 8) {
    throw new MemberAuthError('Password must be at least 8 characters long.');
  }
  if (password.length > 200) {
    throw new MemberAuthError('Password must be 200 characters or fewer.');
  }

  const displayName = username.trim();
  try {
    const row = await (await ready()).one<{ id: number }>(
      `INSERT INTO members (username, password_hash, name, money, sc, consent_at)
       VALUES ($1, $2, $3, $4, 0, CASE WHEN $5 THEN now() ELSE NULL END) RETURNING id`,
      [cleanUsername, hashSecret(password), displayName, welcomeMoney, consent]
    );
    return {
      id: Number(row?.id ?? 0),
      username: cleanUsername,
      name: displayName,
      sc: 0,
      money: welcomeMoney,
      phone: '',
      address: '',
      upiId: '',
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new MemberAuthError('That member ID is already taken. Pick another one.');
    }
    throw error;
  }
}

interface MemberAuthRow extends MemberRow {
  password_hash: string;
}

/** Return the member when the ID and password match, otherwise null. */
export async function verifyMemberCredentials(
  username: string,
  password: string
): Promise<Member | null> {
  const cleanUsername = username.trim().toLowerCase();
  if (!cleanUsername || !password) return null;

  const row = await (await ready()).one<MemberAuthRow>(
    `SELECT ${MEMBER_COLUMNS}, password_hash FROM members WHERE lower(username) = $1`,
    [cleanUsername]
  );
  if (!row || !row.password_hash) return null;
  if (!verifySecret(password, row.password_hash)) return null;
  return rowToMember(row);
}

/**
 * Permanently delete an account and everything attached to it.
 *
 * Orders, coin history, bookings and game sessions all reference `members` with
 * ON DELETE CASCADE, so one DELETE removes the member's personal data. The
 * password is required so a borrowed session cannot wipe the account.
 */
export async function deleteMemberAccount(
  memberId: number,
  password: string
): Promise<boolean> {
  const row = await (await ready()).one<{ password_hash: string }>(
    'SELECT password_hash FROM members WHERE id = $1',
    [memberId]
  );
  if (!row?.password_hash) return false;
  if (!verifySecret(password, row.password_hash)) return false;
  await (await ready()).exec('DELETE FROM members WHERE id = $1', [memberId]);
  return true;
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
  if (address.length > 300) {
    throw new MemberProfileError('Address must be 300 characters or fewer.');
  }
  if (upiId.length > 60) {
    throw new MemberProfileError('UPI ID must be 60 characters or fewer.');
  }

  await (await ready()).exec(
    'UPDATE members SET name = $1, phone = $2, address = $3, upi_id = $4 WHERE id = $5',
    [name, phone, address, upiId, memberId]
  );
  return getMember(memberId);
}

export async function addMoney(memberId: number, amount: number): Promise<number> {
  return transaction(async (tx) => {
    const current = await tx.one<{ money: number }>('SELECT money FROM members WHERE id = $1', [
      memberId,
    ]);
    if (!current) throw new Error('Member not found');
    const newMoney = round2(Number(current.money) + amount);
    await tx.exec('UPDATE members SET money = $1 WHERE id = $2', [newMoney, memberId]);
    return newMoney;
  });
}

// ---------------------------------------------------------------------------
// Admin: members
// ---------------------------------------------------------------------------

export interface AdminMember {
  id: number;
  username: string;
  name: string;
  phone: string;
  money: number;
  sc: number;
  createdAt: string;
}

/** Everyone with a member card, newest first, for the admin members list. */
export async function listMembersForAdmin(): Promise<AdminMember[]> {
  const rows = await (await ready()).rows<MemberRow & { created_at: Date }>(
    `SELECT ${MEMBER_COLUMNS}, created_at FROM members ORDER BY name COLLATE "C", id`
  );
  return rows.map((row) => ({
    id: row.id,
    username: row.username ?? '',
    name: row.name,
    phone: row.phone ?? '',
    money: Number(row.money ?? 0),
    sc: Number(row.sc ?? 0),
    createdAt: toIso(row.created_at),
  }));
}

/**
 * Staff correction of a member's wallet and/or loyalty coins.
 *
 * Deltas (not replacement balances) are used so two staff members adjusting at
 * the same time add up instead of overwriting each other. Coins always leave a
 * ledger entry with the staff note, so the member can see why the balance moved.
 */
export async function adjustMemberBalances(
  memberId: number,
  moneyDelta: number,
  coinDelta: number,
  note: string
): Promise<Member> {
  const cleanNote = note.trim().slice(0, 120);
  if (!Number.isFinite(moneyDelta) || !Number.isFinite(coinDelta)) {
    throw new AdminError('Enter a valid amount to add or remove.');
  }
  if (Math.abs(moneyDelta) > 1_000_000 || Math.abs(coinDelta) > 1_000_000) {
    throw new AdminError('That adjustment is too large. Keep it under ₹10,00,000 / 10,00,000 coins.');
  }
  if (moneyDelta === 0 && coinDelta === 0) {
    throw new AdminError('Enter a wallet or coin amount to adjust.');
  }

  const updated = await transaction(async (tx) => {
    const current = await tx.one<{ money: number; sc: number }>(
      'SELECT money, sc FROM members WHERE id = $1 FOR UPDATE',
      [memberId]
    );
    if (!current) throw new AdminError('Member not found.');

    const newMoney = round2(Number(current.money) + round2(moneyDelta));
    const newCoins = round2(Number(current.sc) + round2(coinDelta));
    if (newMoney < 0) throw new AdminError('The wallet balance cannot go below ₹0.');
    if (newCoins < 0) throw new AdminError('The coin balance cannot go below 0.');

    await tx.exec('UPDATE members SET money = $1, sc = $2 WHERE id = $3', [
      newMoney,
      newCoins,
      memberId,
    ]);
    if (coinDelta !== 0) {
      await tx.exec(
        `INSERT INTO coin_transactions (member_id, amount, reason, ref)
         VALUES ($1, $2, 'admin_adjust', $3)`,
        [memberId, round2(coinDelta), cleanNote]
      );
    }

    // Read through the same transaction: the pooled connection used by
    // getMember() cannot see uncommitted changes yet.
    const row = await tx.one<MemberRow>(
      `SELECT ${MEMBER_COLUMNS} FROM members WHERE id = $1`,
      [memberId]
    );
    if (!row) throw new AdminError('Member not found.');
    return rowToMember(row);
  });

  if (!updated) throw new AdminError('Member not found.');
  return updated;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function placeOrder(
  memberId: number,
  items: { name: string; quantity: number }[],
  scUsed: number,
  options: { orderType?: OrderType; tableNumber?: string; note?: string } = {}
) {
  const orderType: OrderType = isOrderType(options.orderType) ? options.orderType : 'dine_in';
  const tableNumber = orderType === 'dine_in' ? (options.tableNumber ?? '').trim() : '';
  const note = (options.note ?? '').trim();

  if (orderType === 'dine_in' && !TABLES.some((table) => table.id === tableNumber)) {
    throw new OrderError('Pick the table you are sitting at.');
  }
  if (note.length > 200) {
    throw new OrderError('Order note must be 200 characters or fewer.');
  }

  return transaction(async (tx) => {
    const rows = await tx.rows<{ name: string; price: number }>(
      'SELECT name, price FROM menu_items WHERE active = true'
    );
    const priceMap = new Map(rows.map((r) => [r.name, Number(r.price)]));

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

    // Loyalty coins may never pay the whole bill. The admin sets a cap
    // (default 50%), so a large coin balance cannot make an order free.
    const capRow = await tx.one<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'max_discount_percent'"
    );
    const capPercent = clampPercent(
      Number(capRow?.value ?? SETTING_DEFAULTS.max_discount_percent)
    );
    const maxCoins = Math.floor(round2((total * capPercent) / 100) * SC_PER_RUPEE);
    if (spentSc > maxCoins) {
      throw new MenuItemError(
        capPercent === 0
          ? 'Loyalty coins cannot be used on this order.'
          : `Loyalty coins can cover at most ${capPercent}% of this bill (${maxCoins} coins).`
      );
    }

    const discount = round2(spentSc / SC_PER_RUPEE);
    const amountToPay = round2(total - discount);

    const member = await tx.one<{ money: number; sc: number; address: string; phone: string }>(
      'SELECT money, sc, address, phone FROM members WHERE id = $1',
      [memberId]
    );
    if (!member) throw new Error('Member not found');

    if (orderType === 'delivery' && !member.address.trim()) {
      throw new OrderError('Add your delivery address in your profile before ordering delivery.');
    }

    if (spentSc > 0 && spentSc > Number(member.sc)) {
      throw new MenuItemError(`You only have ${Number(member.sc).toFixed(0)} Snake Coins.`);
    }
    if (Number(member.money) < amountToPay) {
      throw new InsufficientBalanceError(round2(amountToPay - Number(member.money)));
    }

    const newMoney = round2(Number(member.money) - amountToPay);
    const newSc = round2(Number(member.sc) - spentSc);
    await tx.exec('UPDATE members SET money = $1, sc = $2 WHERE id = $3', [
      newMoney,
      newSc,
      memberId,
    ]);

    // A delivery order carries the saved address so the kitchen knows where it goes.
    const orderNote = (
      orderType === 'delivery'
        ? `Deliver to: ${member.address.trim()}${member.phone ? ` · ${member.phone}` : ''}${
            note ? ` — ${note}` : ''
          }`
        : note
    ).slice(0, 500);

    const inserted = await tx.one<{ id: number; created_at: Date }>(
      `INSERT INTO orders
         (member_id, status, order_type, table_number, items, subtotal, coin_discount,
          total, coins_used, payment_method, note)
       VALUES ($1, 'pending', $2, $3, $4::jsonb, $5, $6, $7, $8, 'wallet', $9)
       RETURNING id, created_at`,
      [
        memberId,
        orderType,
        tableNumber,
        JSON.stringify(detailItems),
        total,
        discount,
        amountToPay,
        spentSc,
        orderNote,
      ]
    );

    if (spentSc > 0) {
      await tx.exec(
        `INSERT INTO coin_transactions (member_id, amount, reason, ref)
         VALUES ($1, $2, 'order_discount', $3)`,
        [memberId, -spentSc, String(inserted?.id ?? '')]
      );
    }

    const orderId = Number(inserted?.id ?? 0);
    return {
      orderId,
      orderNo: orderNo(orderId),
      status: 'pending' as OrderStatus,
      orderType,
      tableNumber,
      note: orderNote,
      createdAt: toIso(inserted?.created_at),
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

export interface CoinTransaction {
  id: number;
  amount: number;
  reason: string;
  ref: string;
  createdAt: string;
}

/** The member-visible coin ledger, newest first. */
export async function getCoinTransactions(
  memberId: number,
  limit = 50
): Promise<CoinTransaction[]> {
  const rows = await (await ready()).rows<{
    id: number;
    amount: number;
    reason: string;
    ref: string;
    created_at: Date;
  }>(
    `SELECT id, amount, reason, ref, created_at
       FROM coin_transactions
      WHERE member_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [memberId, limit]
  );
  return rows.map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    reason: row.reason,
    ref: row.ref ?? '',
    createdAt: toIso(row.created_at),
  }));
}

export async function creditReward(
  memberId: number,
  amount: number,
  ref = ''
): Promise<number> {
  return transaction(async (tx) => {
    const current = await tx.one<{ sc: number }>('SELECT sc FROM members WHERE id = $1', [memberId]);
    if (!current) throw new Error('Member not found');
    const newBalance = round2(Number(current.sc) + amount);
    await tx.exec('UPDATE members SET sc = $1 WHERE id = $2', [newBalance, memberId]);
    await tx.exec(
      `INSERT INTO coin_transactions (member_id, amount, reason, ref)
       VALUES ($1, $2, 'game_win', $3)`,
      [memberId, amount, ref]
    );
    return newBalance;
  });
}

interface OrderRow {
  id: number;
  member_id: number;
  member_name: string | null;
  status: string;
  order_type: string;
  table_number: string;
  items: unknown;
  subtotal: number;
  coin_discount: number;
  total: number;
  coins_used: number;
  payment_method: string;
  note: string;
  created_at: Date;
  updated_at: Date;
}

const ORDER_SELECT = `
  SELECT o.id, o.member_id, o.status, o.order_type, o.table_number, o.items,
         o.subtotal, o.coin_discount, o.total, o.coins_used, o.payment_method,
         o.note, o.created_at, o.updated_at, m.name AS member_name
    FROM orders o JOIN members m ON m.id = o.member_id`;

function parseOrderItems(raw: unknown): OrderLine[] {
  if (!Array.isArray(raw)) return [];
  const valid = raw.every((item: unknown) => {
    if (typeof item !== 'object' || item === null) return false;
    const line = item as Record<string, unknown>;
    return (
      typeof line.name === 'string' &&
      typeof line.price === 'number' &&
      typeof line.quantity === 'number'
    );
  });
  return valid ? (raw as OrderLine[]) : [];
}

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    orderNo: orderNo(row.id),
    memberId: row.member_id,
    memberName: row.member_name ?? '',
    status: isOrderStatus(row.status) ? row.status : 'pending',
    orderType: isOrderType(row.order_type) ? row.order_type : 'dine_in',
    tableNumber: row.table_number ?? '',
    items: parseOrderItems(row.items),
    subtotal: Number(row.subtotal ?? 0),
    coinDiscount: Number(row.coin_discount ?? 0),
    total: Number(row.total ?? 0),
    coinsUsed: Number(row.coins_used ?? 0),
    paymentMethod: row.payment_method ?? 'wallet',
    note: row.note ?? '',
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function getOrder(id: number): Promise<Order | null> {
  const row = await (await ready()).one<OrderRow>(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
  return row ? rowToOrder(row) : null;
}

export async function getMemberOrders(memberId: number, limit = 50): Promise<Order[]> {
  const rows = await (await ready()).rows<OrderRow>(
    `${ORDER_SELECT} WHERE o.member_id = $1 ORDER BY o.created_at DESC, o.id DESC LIMIT $2`,
    [memberId, limit]
  );
  return rows.map(rowToOrder);
}

/** Orders the kitchen still has to deal with, oldest first. */
export async function getOpenOrders(): Promise<Order[]> {
  const rows = await (await ready()).rows<OrderRow>(
    `${ORDER_SELECT}
      WHERE o.status IN ('pending','preparing','ready')
      ORDER BY o.created_at ASC, o.id ASC`
  );
  return rows.map(rowToOrder);
}

/** Completed / cancelled orders, newest first. */
export async function getRecentClosedOrders(limit = 25): Promise<Order[]> {
  const rows = await (await ready()).rows<OrderRow>(
    `${ORDER_SELECT}
      WHERE o.status IN ('completed','cancelled')
      ORDER BY o.updated_at DESC, o.id DESC
      LIMIT $1`,
    [limit]
  );
  return rows.map(rowToOrder);
}

type LockedOrder = {
  status: string;
  member_id: number;
  total: number;
  coins_used: number;
};

/**
 * Read an order for update. FOR UPDATE stops two admins (or a customer and an
 * admin) from refunding the same order twice at the same moment.
 */
async function lockOrder(tx: Db, id: number): Promise<LockedOrder | undefined> {
  return tx.one<LockedOrder>(
    'SELECT status, member_id, total, coins_used FROM orders WHERE id = $1 FOR UPDATE',
    [id]
  );
}

async function readOrderTx(tx: Db, id: number): Promise<Order> {
  const row = await tx.one<OrderRow>(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
  if (!row) throw new OrderError('Order not found.');
  return rowToOrder(row);
}

/** Put the money and coins from a cancelled order back where they came from. */
async function refundOrder(
  tx: Db,
  orderId: number,
  total: number,
  coinsUsed: number
): Promise<void> {
  if (total > 0) {
    await tx.exec(
      `UPDATE members SET money = money + $1
        WHERE id = (SELECT member_id FROM orders WHERE id = $2)`,
      [total, orderId]
    );
  }
  if (coinsUsed > 0) {
    await tx.exec(
      `UPDATE members SET sc = sc + $1
        WHERE id = (SELECT member_id FROM orders WHERE id = $2)`,
      [coinsUsed, orderId]
    );
    await tx.exec(
      `INSERT INTO coin_transactions (member_id, amount, reason, ref)
       SELECT member_id, $1, 'order_refund', $3 FROM orders WHERE id = $2`,
      [coinsUsed, orderId, String(orderId)]
    );
  }
}

/** Staff action: move an order along its status lifecycle. */
export async function updateOrderStatus(id: number, next: OrderStatus): Promise<Order> {
  return transaction(async (tx) => {
    const current = await lockOrder(tx, id);
    if (!current) throw new OrderError('Order not found.');

    const from: OrderStatus = isOrderStatus(current.status) ? current.status : 'pending';
    if (from === next) return readOrderTx(tx, id);

    if (!canTransition(from, next)) {
      throw new OrderError(
        `An order that is ${ORDER_STATUS_LABEL[from].toLowerCase()} cannot be moved to ${ORDER_STATUS_LABEL[next].toLowerCase()}.`
      );
    }

    if (next === 'cancelled') {
      await refundOrder(tx, id, Number(current.total ?? 0), Number(current.coins_used ?? 0));
    }

    await tx.exec('UPDATE orders SET status = $1, updated_at = now() WHERE id = $2', [next, id]);
    return readOrderTx(tx, id);
  });
}

/**
 * Cancel an order. Customers may only cancel their own order while it is still
 * `pending`; staff may cancel anything that is not already closed.
 * The amount paid is refunded to the wallet and the coins are returned.
 */
export async function cancelOrder(
  id: number,
  options: { memberId?: number } = {}
): Promise<Order> {
  return transaction(async (tx) => {
    const current = await lockOrder(tx, id);
    if (!current) throw new OrderError('Order not found.');

    const byCustomer = options.memberId !== undefined;
    if (byCustomer && current.member_id !== options.memberId) {
      throw new OrderError('Order not found.');
    }

    const from: OrderStatus = isOrderStatus(current.status) ? current.status : 'pending';

    if (from === 'cancelled') throw new OrderError('This order was already cancelled.');
    if (from === 'completed') throw new OrderError('A completed order cannot be cancelled.');
    if (byCustomer && from !== 'pending') {
      throw new OrderError(
        'The kitchen has already started this order. Please ask a staff member to cancel it.'
      );
    }

    await refundOrder(tx, id, Number(current.total ?? 0), Number(current.coins_used ?? 0));
    await tx.exec("UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1", [id]);
    return readOrderTx(tx, id);
  });
}

// ---------------------------------------------------------------------------
// Table bookings
// ---------------------------------------------------------------------------

/**
 * The cafe's time zone, from admin settings. Every "today" and "has this slot
 * passed" decision uses it, so a UTC server and a local customer agree.
 */
async function cafeTimeZone(): Promise<string> {
  const stored = (await getSetting('timezone'))?.trim() ?? '';
  return isValidTimeZone(stored) ? stored : DEFAULT_TIME_ZONE;
}

export interface BookingWindow {
  today: string;
  maxDate: string;
  timeZone: string;
}

export async function getBookingWindow(): Promise<BookingWindow> {
  const timeZone = await cafeTimeZone();
  const today = dateKeyInZone(new Date(), timeZone);
  return { today, maxDate: addDaysToDateKey(today, MAX_BOOKING_DAYS), timeZone };
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
  status: string;
  created_at: Date;
};

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
    status: row.status,
    timestamp: toIso(row.created_at),
  };
}

export async function getTableAvailability(date: string) {
  const { today, maxDate, timeZone } = await getBookingWindow();
  const rows = await (await ready()).rows<{ slot_id: string; table_number: string }>(
    `SELECT slot_id, table_number FROM bookings
      WHERE date = $1 AND status <> 'cancelled'`,
    [date]
  );
  const booked: Record<string, string[]> = {};
  for (const row of rows) {
    if (!booked[row.slot_id]) booked[row.slot_id] = [];
    booked[row.slot_id].push(row.table_number);
  }
  const now = timeKeyInZone(new Date(), timeZone);
  const slots = TIME_SLOTS.map((s) => ({
    id: s.id,
    label: s.label,
    disabled: date === today && SLOT_STARTS[s.id] <= now,
  }));
  return { date, today, maxDate, timeZone, slots, booked };
}

export async function getMemberBookings(memberId: number): Promise<BookingInvoice[]> {
  const rows = await (await ready()).rows<BookingRow>(
    `SELECT b.id, b.table_number, b.table_label, b.capacity, b.seats, b.date,
            b.slot_id, b.slot_label, b.status, b.created_at,
            m.name AS member_name
       FROM bookings b JOIN members m ON m.id = b.member_id
      WHERE b.member_id = $1
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

  if (!isValidDateKey(date)) {
    throw new BookingError('Pick a valid date.');
  }
  const { today, maxDate, timeZone } = await getBookingWindow();
  if (date < today) throw new BookingError(`You can't book a table in the past.`);
  if (date > maxDate) throw new BookingError(`Bookings are open up to ${MAX_BOOKING_DAYS} days ahead.`);

  const slot = TIME_SLOTS.find((s) => s.id === slotId);
  if (!slot) throw new BookingError('Pick a valid time slot.');
  if (date === today && SLOT_STARTS[slotId] <= timeKeyInZone(new Date(), timeZone)) {
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

  return transaction(async (tx) => {
    const mine = await tx.one<{ id: number }>(
      `SELECT id FROM bookings
        WHERE member_id = $1 AND date = $2 AND slot_id = $3 AND status <> 'cancelled'`,
      [memberId, date, slotId]
    );
    if (mine) {
      throw new BookingError('You already have a table booked at this date and time.');
    }

    let inserted: { id: number } | undefined;
    try {
      inserted = await tx.one<{ id: number }>(
        `INSERT INTO bookings
           (member_id, table_number, table_label, capacity, seats, date, slot_id, slot_label, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed')
         RETURNING id`,
        [memberId, table.id, table.label, table.capacity, seats, date, slot.id, slot.label]
      );
    } catch (error) {
      // The unique index stopped two people grabbing the same table at once.
      if (isUniqueViolation(error)) {
        throw new BookingError(`Table ${table.label} is already booked for ${slot.label}.`);
      }
      throw error;
    }

    const row = await tx.one<BookingRow>(
      `SELECT b.id, b.table_number, b.table_label, b.capacity, b.seats, b.date,
              b.slot_id, b.slot_label, b.status, b.created_at, $2::text AS member_name
         FROM bookings b WHERE b.id = $1`,
      [Number(inserted?.id ?? 0), memberName]
    );
    if (!row) {
      throw new BookingError('Could not save the booking. Please try again.');
    }
    return rowToBooking(row);
  });
}

const BOOKING_SELECT = `
  SELECT b.id, b.table_number, b.table_label, b.capacity, b.seats, b.date,
         b.slot_id, b.slot_label, b.status, b.created_at,
         m.name AS member_name
    FROM bookings b JOIN members m ON m.id = b.member_id`;

async function readBookingRow(id: number): Promise<BookingRow | undefined> {
  return (await ready()).one<BookingRow>(`${BOOKING_SELECT} WHERE b.id = $1`, [id]);
}

/** Every booking that has not been cancelled, from today to the open window. */
export async function getUpcomingBookings(): Promise<BookingInvoice[]> {
  const { today, maxDate } = await getBookingWindow();
  const rows = await (await ready()).rows<BookingRow>(
    `${BOOKING_SELECT}
      WHERE b.status <> 'cancelled' AND b.date >= $1 AND b.date <= $2
      ORDER BY b.date, b.id`,
    [today, maxDate]
  );
  const slotOrder = new Map(TIME_SLOTS.map((slot, index) => [slot.id, index]));
  return rows
    .map(rowToBooking)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (slotOrder.get(a.slotId) ?? 0) - (slotOrder.get(b.slotId) ?? 0) ||
        a.tableLabel.localeCompare(b.tableLabel)
    );
}

/** Today's reservations, in the order they will arrive. */
export interface TodayBookings {
  date: string;
  bookings: BookingInvoice[];
  seats: number;
}

export async function getTodayBookings(): Promise<TodayBookings> {
  const { today } = await getBookingWindow();
  const rows = await (await ready()).rows<BookingRow>(
    `${BOOKING_SELECT}
      WHERE b.status <> 'cancelled' AND b.date = $1
      ORDER BY b.id`,
    [today]
  );
  const slotOrder = new Map(TIME_SLOTS.map((slot, index) => [slot.id, index]));
  const bookings = rows
    .map(rowToBooking)
    .sort(
      (a, b) =>
        (slotOrder.get(a.slotId) ?? 0) - (slotOrder.get(b.slotId) ?? 0) ||
        a.tableLabel.localeCompare(b.tableLabel)
    );
  return {
    date: today,
    bookings,
    seats: bookings.reduce((sum, booking) => sum + booking.seats, 0),
  };
}

// ---------------------------------------------------------------------------
// Admin: sales reports
// ---------------------------------------------------------------------------

export interface SalesSummary {
  date: string;
  orders: number;
  gross: number;
  collected: number;
  coinDiscount: number;
  coinsUsed: number;
  averageTicket: number;
}

export interface BestSeller {
  name: string;
  quantity: number;
  revenue: number;
}

export interface DailySales {
  date: string;
  orders: number;
  collected: number;
}

export interface SalesReport {
  timeZone: string;
  today: SalesSummary;
  bestSellers: BestSeller[];
  last7Days: DailySales[];
}

/**
 * Sales started "today" in the cafe's time zone. Cancelled orders are left out:
 * they were refunded, so counting them would overstate the day.
 *
 * The day boundary is calculated inside Postgres with the configured IANA zone,
 * which handles days that are not exactly 24 hours long.
 */
export async function getSalesReport(): Promise<SalesReport> {
  const d = await ready();
  const { today, timeZone } = await getBookingWindow();
  const start = addDaysToDateKey(today, -6);

  const summary = await d.one<{
    orders: number;
    gross: number;
    collected: number;
    coin_discount: number;
    coins_used: number;
  }>(
    `SELECT count(*)::int AS orders,
            COALESCE(SUM(subtotal), 0) AS gross,
            COALESCE(SUM(total), 0) AS collected,
            COALESCE(SUM(coin_discount), 0) AS coin_discount,
            COALESCE(SUM(coins_used), 0) AS coins_used
       FROM orders
      WHERE status <> 'cancelled'
        AND created_at >= ($1::date::timestamp AT TIME ZONE $2)
        AND created_at <  (($1::date + 1)::timestamp AT TIME ZONE $2)`,
    [today, timeZone]
  );

  const bestSellers = await d.rows<{ name: string; quantity: number; revenue: number }>(
    `SELECT item->>'name' AS name,
            SUM((item->>'quantity')::numeric)::int AS quantity,
            SUM(((item->>'quantity')::numeric) * ((item->>'price')::numeric)) AS revenue
       FROM orders o
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END
       ) AS item
      WHERE o.status <> 'cancelled'
        AND jsonb_typeof(item) = 'object'
        AND item ? 'name' AND item ? 'quantity' AND item ? 'price'
        AND o.created_at >= ($1::date::timestamp AT TIME ZONE $2)
        AND o.created_at <  (($1::date + 1)::timestamp AT TIME ZONE $2)
      GROUP BY 1
      ORDER BY quantity DESC, revenue DESC
      LIMIT 8`,
    [today, timeZone]
  );

  const daily = await d.rows<{ day: string; orders: number; collected: number }>(
    `SELECT to_char((created_at AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS day,
            count(*)::int AS orders,
            COALESCE(SUM(total), 0) AS collected
       FROM orders
      WHERE status <> 'cancelled'
        AND created_at >= ($1::date::timestamp AT TIME ZONE $2)
        AND created_at <  (($3::date + 1)::timestamp AT TIME ZONE $2)
      GROUP BY 1`,
    [start, timeZone, today]
  );
  const byDay = new Map(daily.map((row) => [row.day, row]));

  const orders = Number(summary?.orders ?? 0);
  const gross = Number(summary?.gross ?? 0);
  return {
    timeZone,
    today: {
      date: today,
      orders,
      gross,
      collected: Number(summary?.collected ?? 0),
      coinDiscount: Number(summary?.coin_discount ?? 0),
      coinsUsed: Number(summary?.coins_used ?? 0),
      averageTicket: orders > 0 ? round2(gross / orders) : 0,
    },
    bestSellers: bestSellers.map((row) => ({
      name: row.name,
      quantity: Number(row.quantity ?? 0),
      revenue: Number(row.revenue ?? 0),
    })),
    last7Days: Array.from({ length: 7 }, (_, index) => {
      const date = addDaysToDateKey(start, index);
      const row = byDay.get(date);
      return {
        date,
        orders: Number(row?.orders ?? 0),
        collected: Number(row?.collected ?? 0),
      };
    }),
  };
}


export async function cancelBooking(id: number): Promise<BookingInvoice> {
  const existing = await readBookingRow(id);
  if (!existing) throw new BookingError('Booking not found.');
  if (existing.status === 'cancelled') {
    throw new BookingError('That booking is already cancelled.');
  }

  await (await ready()).exec(
    "UPDATE bookings SET status = 'cancelled' WHERE id = $1",
    [id]
  );

  const updated = await readBookingRow(id);
  if (!updated) throw new BookingError('Booking not found.');
  return rowToBooking(updated);
}

// ---------------------------------------------------------------------------
// Menu items
// ---------------------------------------------------------------------------

interface MenuItemRow {
  id: number;
  name: string;
  price: number;
  category: string;
  image: string;
  active: boolean;
}

function rowToMenuItem(row: MenuItemRow): MenuItem {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    category: row.category,
    image: row.image ?? '',
    active: Boolean(row.active),
  };
}

const MENU_COLUMNS = 'id, name, price, category, image, active';

export async function listMenuItems(): Promise<MenuItem[]> {
  const rows = await (await ready()).rows<MenuItemRow>(
    `SELECT ${MENU_COLUMNS} FROM menu_items ORDER BY category, name`
  );
  return rows.map(rowToMenuItem);
}

export async function getActiveMenuItems(): Promise<MenuItem[]> {
  const rows = await (await ready()).rows<MenuItemRow>(
    `SELECT ${MENU_COLUMNS} FROM menu_items WHERE active = true ORDER BY category, name`
  );
  return rows.map(rowToMenuItem);
}

export async function getMenuItemByName(name: string): Promise<MenuItem | null> {
  const row = await (await ready()).one<MenuItemRow>(
    `SELECT ${MENU_COLUMNS} FROM menu_items WHERE name = $1`,
    [name]
  );
  return row ? rowToMenuItem(row) : null;
}

export async function getMenuItemById(id: number): Promise<MenuItem | null> {
  const row = await (await ready()).one<MenuItemRow>(
    `SELECT ${MENU_COLUMNS} FROM menu_items WHERE id = $1`,
    [id]
  );
  return row ? rowToMenuItem(row) : null;
}

export async function createMenuItem(data: {
  name: string;
  price: number;
  category: string;
  image?: string;
}): Promise<MenuItem> {
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

  const row = await (await ready()).one<{ id: number }>(
    'INSERT INTO menu_items (name, price, category, image) VALUES ($1, $2, $3, $4) RETURNING id',
    [name, price, category, image]
  );
  return { id: Number(row?.id ?? 0), name, price, category, image, active: true };
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

  await (await ready()).exec(
    'UPDATE menu_items SET name = $1, price = $2, category = $3, image = $4, active = $5 WHERE id = $6',
    [next.name, next.price, next.category, next.image, next.active, id]
  );
  return getMenuItemById(id);
}

export async function deleteMenuItem(id: number): Promise<boolean> {
  const changes = await (await ready()).exec('DELETE FROM menu_items WHERE id = $1', [id]);
  return changes > 0;
}

// ---------------------------------------------------------------------------
// Game turn limits
// ---------------------------------------------------------------------------

interface GameLimitState {
  allowed: boolean;
  cooldown: boolean;
  retryAfterMs: number | null;
  attemptsLeft: number;
}

async function readGameLimit(
  memberId: number,
  game: string
): Promise<{ plays: number; cooldown_until: number }> {
  const row = await (await ready()).one<{ plays: number; cooldown_until: number }>(
    'SELECT plays, cooldown_until FROM game_limits WHERE member_id = $1 AND game = $2',
    [memberId, game]
  );
  return { plays: Number(row?.plays ?? 0), cooldown_until: Number(row?.cooldown_until ?? 0) };
}

async function writeGameLimit(
  memberId: number,
  game: string,
  plays: number,
  cooldownUntil: number
): Promise<void> {
  await (await ready()).exec(
    `INSERT INTO game_limits (member_id, game, plays, cooldown_until)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (member_id, game) DO UPDATE
       SET plays = excluded.plays, cooldown_until = excluded.cooldown_until`,
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
 * - Losing consumes one of the daily tries; the 3rd loss starts a 24h cooldown.
 * - Winning starts the 24h cooldown immediately, even on the 1st or 2nd try.
 */
export async function recordGameOutcome(
  memberId: number,
  game: string,
  won: boolean
): Promise<GameLimitState> {
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

// ---------------------------------------------------------------------------
// Game sessions
// ---------------------------------------------------------------------------

export async function createGameSession(
  memberId: number,
  game: string,
  secret?: number,
  board = ''
): Promise<GameSession> {
  // Retire any live game first: the partial unique index allows only one
  // active session per member per game.
  const id = await transaction(async (tx) => {
    await tx.exec(
      `UPDATE game_sessions SET status = 'abandoned'
        WHERE member_id = $1 AND game = $2 AND status = 'active'`,
      [memberId, game]
    );
    const row = await tx.one<{ id: number }>(
      'INSERT INTO game_sessions (member_id, game, secret, board) VALUES ($1, $2, $3, $4) RETURNING id',
      [memberId, game, secret ?? null, board]
    );
    return Number(row?.id ?? 0);
  });
  return {
    id,
    member_id: memberId,
    game,
    secret: secret ?? null,
    board,
    moves: 0,
    status: 'active',
  };
}

interface GameSessionRow {
  id: number;
  member_id: number;
  game: string;
  secret: number | null;
  board: string;
  moves: number;
  status: string;
}

function rowToGameSession(row: GameSessionRow): GameSession {
  return {
    id: row.id,
    member_id: row.member_id,
    game: row.game,
    secret: row.secret,
    board: row.board ?? '',
    moves: Number(row.moves ?? 0),
    status: row.status,
  };
}

const GAME_SESSION_COLUMNS = 'id, member_id, game, secret, board, moves, status';

export async function getGameSession(id: number): Promise<GameSession | null> {
  const row = await (await ready()).one<GameSessionRow>(
    `SELECT ${GAME_SESSION_COLUMNS} FROM game_sessions WHERE id = $1`,
    [id]
  );
  return row ? rowToGameSession(row) : null;
}

/** The single live session a member may have for one game, if any. */
export async function getActiveGameSession(
  memberId: number,
  game: string
): Promise<GameSession | null> {
  const row = await (await ready()).one<GameSessionRow>(
    `SELECT ${GAME_SESSION_COLUMNS}
       FROM game_sessions
      WHERE member_id = $1 AND game = $2 AND status = 'active'
      ORDER BY id DESC
      LIMIT 1`,
    [memberId, game]
  );
  return row ? rowToGameSession(row) : null;
}

export async function updateSessionMoves(id: number, moves: number): Promise<void> {
  await (await ready()).exec('UPDATE game_sessions SET moves = $1 WHERE id = $2', [moves, id]);
}

export async function updateSessionBoard(id: number, board: string, moves: number): Promise<void> {
  await (await ready()).exec(
    'UPDATE game_sessions SET board = $1, moves = $2 WHERE id = $3',
    [board, moves, id]
  );
}

export async function finishGameSession(
  id: number,
  status: 'won' | 'lost' | 'draw' | 'abandoned'
): Promise<void> {
  await (await ready()).exec('UPDATE game_sessions SET status = $1 WHERE id = $2', [status, id]);
}

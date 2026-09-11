import 'server-only';
import { DatabaseSync } from 'node:sqlite';
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
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = path.join(DATA_DIR, 'snake_cafe.db');

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

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec(`
      PRAGMA foreign_keys = ON;

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
    `);
    ensureMenuImageColumn();
    seedSettings();
    ensureMoneyColumn();
    ensureProfileColumns();
    ensureInvoiceColumns();
    ensureBookingsTable();
    seedMenu();
  }
  return db;
}

function seedSettings(): void {
  const defaultPasscode = process.env.SNAKE_CAFE_ADMIN_PASSCODE ?? 'admin123';
  const existing = new Set(
    (getDb().prepare('SELECT key FROM Settings').all() as { key: string }[]).map((r) => r.key)
  );
  const settingDefaults: Record<string, string> = {
    ...SETTING_DEFAULTS,
    admin_passcode_hash: hashPasscode(defaultPasscode),
  };
  const insert = getDb().prepare('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(settingDefaults)) {
    if (!existing.has(key)) insert.run(key, value);
  }
}

function ensureMenuImageColumn(): void {
  const columns = getDb().prepare('PRAGMA table_info(MenuItems)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'image')) {
    getDb().exec(`ALTER TABLE MenuItems ADD COLUMN image TEXT NOT NULL DEFAULT ''`);
  }
  const backfill = getDb().prepare(
    `UPDATE MenuItems SET image = ? WHERE name = ? AND (image IS NULL OR image = '')`
  );
  for (const item of MENU_SEED) {
    if (item.image) backfill.run(item.image, item.name);
  }
}

function ensureMoneyColumn(): void {
  const columns = getDb().prepare('PRAGMA table_info(Members)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'money')) {
    getDb().exec(`ALTER TABLE Members ADD COLUMN money REAL NOT NULL DEFAULT 0`);
  }
  const welcome = getSetting('welcome_bonus') ?? SETTING_DEFAULTS.welcome_bonus;
  getDb()
    .prepare('UPDATE Members SET money = ? WHERE money IS NULL OR money = 0')
    .run(Number(welcome));
}

function ensureProfileColumns(): void {
  const columns = getDb().prepare('PRAGMA table_info(Members)').all() as { name: string }[];
  for (const col of ['phone', 'address', 'upi_id'] as const) {
    if (!columns.some((c) => c.name === col)) {
      getDb().exec(`ALTER TABLE Members ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
  }
}

function ensureInvoiceColumns(): void {
  const columns = getDb().prepare('PRAGMA table_info(Transactions)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'sc_used')) {
    getDb().exec(`ALTER TABLE Transactions ADD COLUMN sc_used REAL NOT NULL DEFAULT 0`);
  }
  if (!columns.some((c) => c.name === 'items_json')) {
    getDb().exec(`ALTER TABLE Transactions ADD COLUMN items_json TEXT NOT NULL DEFAULT '[]'`);
  }
}

function ensureBookingsTable(): void {
  getDb().exec(`
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
    `);
}

// ---- Game turn limits ----

interface GameLimitState {
  allowed: boolean;
  cooldown: boolean;
  retryAfterMs: number | null;
  attemptsLeft: number;
}

function readGameLimit(memberId: number, game: string): { plays: number; cooldown_until: number } {
  const row = getDb()
    .prepare('SELECT plays, cooldown_until FROM GameLimits WHERE member_id = ? AND game = ?')
    .get(memberId, game) as { plays: number; cooldown_until: number } | undefined;
  return { plays: row?.plays ?? 0, cooldown_until: row?.cooldown_until ?? 0 };
}

function writeGameLimit(memberId: number, game: string, plays: number, cooldownUntil: number): void {
  getDb()
    .prepare(
      `INSERT INTO GameLimits (member_id, game, plays, cooldown_until) VALUES (?, ?, ?, ?)
       ON CONFLICT(member_id, game) DO UPDATE SET
         plays = excluded.plays,
         cooldown_until = excluded.cooldown_until`
    )
    .run(memberId, game, plays, cooldownUntil);
}

function gameLimitState(
  plays: number,
  cooldownUntil: number,
  now: number
): GameLimitState {
  if (cooldownUntil > now) {
    return { allowed: false, cooldown: true, retryAfterMs: cooldownUntil, attemptsLeft: 0 };
  }
  return { allowed: true, cooldown: false, retryAfterMs: null, attemptsLeft: MAX_GAME_TURNS - plays };
}

/** Read-only view of how many turns a member has left (does not consume a turn). */
export function getGameState(memberId: number, game: string): GameLimitState {
  const { plays, cooldown_until } = readGameLimit(memberId, game);
  return gameLimitState(plays, cooldown_until, Date.now());
}

/**
 * Record the outcome of one game session.
 * - Losing consumes one of the 3 daily tries; the 3rd loss starts a 24h cooldown.
 * - Winning starts the 24h cooldown immediately, even on the 1st or 2nd try.
 */
export function recordGameOutcome(memberId: number, game: string, won: boolean): GameLimitState {
  const now = Date.now();
  const { plays, cooldown_until } = readGameLimit(memberId, game);
  if (cooldown_until > now) {
    return gameLimitState(plays, cooldown_until, now);
  }

  if (won) {
    writeGameLimit(memberId, game, 0, now + GAME_COOLDOWN_MS);
    return { allowed: false, cooldown: true, retryAfterMs: now + GAME_COOLDOWN_MS, attemptsLeft: 0 };
  }

  if (plays + 1 >= MAX_GAME_TURNS) {
    writeGameLimit(memberId, game, 0, now + GAME_COOLDOWN_MS);
    return { allowed: false, cooldown: true, retryAfterMs: now + GAME_COOLDOWN_MS, attemptsLeft: 0 };
  }

  writeGameLimit(memberId, game, plays + 1, 0);
  return { allowed: true, cooldown: false, retryAfterMs: null, attemptsLeft: MAX_GAME_TURNS - (plays + 1) };
}

function seedMenu(): void {
  const count = (getDb().prepare('SELECT COUNT(*) AS n FROM MenuItems').get() as { n: number }).n;
  if (count > 0) return;
  const insert = getDb().prepare(
    'INSERT INTO MenuItems (name, price, category, image, active) VALUES (?, ?, ?, ?, 1)'
  );
  for (const item of MENU_SEED) {
    insert.run(item.name, item.price, item.category, item.image);
  }
}

// ---- Settings ----

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM Settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO Settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

export function getStoreSettings(): StoreSettings {
  return {
    storeName: getSetting('store_name') ?? SETTING_DEFAULTS.store_name,
    currencyName: getSetting('currency_name') ?? SETTING_DEFAULTS.currency_name,
    currencySymbol: getSetting('currency_symbol') ?? SETTING_DEFAULTS.currency_symbol,
    welcomeBonus: Number(getSetting('welcome_bonus') ?? SETTING_DEFAULTS.welcome_bonus),
  };
}

export function passcodeMatches(passcode: string): boolean {
  const stored = getSetting('admin_passcode_hash');
  if (!stored) return false;
  const candidate = hashPasscode(passcode);
  if (stored.length !== candidate.length) return false;
  return timingSafeEqual(Buffer.from(stored, 'utf8'), Buffer.from(candidate, 'utf8'));
}

export function setAdminPasscode(passcode: string): void {
  setSetting('admin_passcode_hash', hashPasscode(passcode));
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

export function getMember(id: number): Member | null {
  const row = getDb()
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM Members WHERE id = ?`)
    .get(id) as MemberRow | undefined;
  return row ? rowToMember(row) : null;
}

export function findMemberByName(name: string): Member | null {
  const row = getDb()
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM Members WHERE name = ?`)
    .get(name) as MemberRow | undefined;
  return row ? rowToMember(row) : null;
}

export function createMember(name: string, welcomeMoney: number): Member {
  const result = getDb()
    .prepare('INSERT INTO Members (name, balance, money) VALUES (?, 0, ?)')
    .run(name, welcomeMoney);
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

export function updateMemberProfile(
  memberId: number,
  updates: Partial<{ name: string; phone: string; address: string; upiId: string }>
): Member | null {
  const current = getMember(memberId);
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
    const clash = findMemberByName(name);
    if (clash && clash.id !== memberId) {
      throw new MemberProfileError(`The name "${name}" is already taken by another member.`);
    }
  }

  getDb()
    .prepare('UPDATE Members SET name = ?, phone = ?, address = ?, upi_id = ? WHERE id = ?')
    .run(name, phone, address, upiId, memberId);
  return getMember(memberId);
}

export function addMoney(memberId: number, amount: number): number {
  const database = getDb();
  database.exec('BEGIN');
  try {
    const current = database
      .prepare('SELECT money FROM Members WHERE id = ?')
      .get(memberId) as { money: number } | undefined;
    if (!current) throw new Error('Member not found');
    const newMoney = Math.round((current.money + amount) * 100) / 100;
    database.prepare('UPDATE Members SET money = ? WHERE id = ?').run(newMoney, memberId);
    database.exec('COMMIT');
    return newMoney;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

// ---- Orders ----

export function placeOrder(
  memberId: number,
  items: { name: string; quantity: number }[],
  scUsed: number
) {
  const database = getDb();
  database.exec('BEGIN');
  try {
    const rows = database
      .prepare('SELECT name, price FROM MenuItems WHERE active = 1')
      .all() as { name: string; price: number }[];
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

    const member = database
      .prepare('SELECT balance, money FROM Members WHERE id = ?')
      .get(memberId) as { balance: number; money: number } | undefined;
    if (!member) throw new Error('Member not found');

    if (spentSc > 0 && spentSc > member.balance) {
      throw new MenuItemError(`You only have ${member.balance.toFixed(0)} Snake Coins.`);
    }
    if (member.money < amountToPay) {
      throw new InsufficientBalanceError(Math.round((amountToPay - member.money) * 100) / 100);
    }

    const newMoney = Math.round((member.money - amountToPay) * 100) / 100;
    const newSc = Math.round((member.balance - spentSc) * 100) / 100;
    database.prepare('UPDATE Members SET money = ?, balance = ? WHERE id = ?').run(newMoney, newSc, memberId);
    const inserted = database
      .prepare('INSERT INTO Transactions (member_id, order_details, total, sc_used, items_json) VALUES (?, ?, ?, ?, ?)')
      .run(memberId, details, amountToPay, spentSc, JSON.stringify(detailItems));
    database.exec('COMMIT');
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
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function creditReward(memberId: number, amount: number): number {
  const database = getDb();
  database.exec('BEGIN');
  try {
    const current = database
      .prepare('SELECT balance FROM Members WHERE id = ?')
      .get(memberId) as { balance: number } | undefined;
    if (!current) throw new Error('Member not found');
    const newBalance = current.balance + amount;
    database.prepare('UPDATE Members SET balance = ? WHERE id = ?').run(newBalance, memberId);
    database.exec('COMMIT');
    return newBalance;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function getTransactions(memberId: number): Invoice[] {
  const rows = getDb()
    .prepare(
      'SELECT id, timestamp, order_details, total, sc_used, items_json FROM Transactions WHERE member_id = ? ORDER BY timestamp DESC, id DESC'
    )
    .all(memberId) as {
    id: number;
    timestamp: string;
    order_details: string;
    total: number;
    sc_used: number;
    items_json: string;
  }[];
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
      timestamp: r.timestamp,
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
    timestamp: row.created_at,
  };
}

export function getTableAvailability(date: string) {
  const rows = getDb()
    .prepare('SELECT slot_id, table_number FROM Bookings WHERE date = ?')
    .all(date) as { slot_id: string; table_number: string }[];
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

export function getMemberBookings(memberId: number): BookingInvoice[] {
  const rows = getDb()
    .prepare(
      `SELECT b.id, b.table_number, b.table_label, b.capacity, b.seats, b.date, b.slot_id, b.slot_label,
              b.created_at, m.name AS member_name
       FROM Bookings b JOIN Members m ON m.id = b.member_id
       WHERE b.member_id = ?
       ORDER BY b.date DESC, b.id DESC`
    )
    .all(memberId) as BookingRow[];
  return rows.map(rowToBooking);
}

export function createBooking(
  memberId: number,
  memberName: string,
  params: { date?: unknown; slot?: unknown; table?: unknown; seats?: unknown }
): BookingInvoice {
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
  const clash = db
    .prepare('SELECT id FROM Bookings WHERE date = ? AND slot_id = ? AND table_number = ?')
    .get(date, slotId, tableId);
  if (clash) {
    throw new BookingError(`Table ${table.label} is already booked for ${slot.label}.`);
  }
  const mine = db
    .prepare('SELECT id FROM Bookings WHERE member_id = ? AND date = ? AND slot_id = ?')
    .get(memberId, date, slotId);
  if (mine) {
    throw new BookingError('You already have a table booked at this date and time.');
  }

  const inserted = db
    .prepare(
      'INSERT INTO Bookings (member_id, table_number, table_label, capacity, seats, date, slot_id, slot_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(memberId, table.id, table.label, table.capacity, seats, date, slot.id, slot.label);
  const row = db
    .prepare(
      `SELECT b.id, b.table_number, b.table_label, b.capacity, b.seats, b.date, b.slot_id, b.slot_label,
              b.created_at, ? AS member_name
       FROM Bookings b WHERE b.id = ?`
    )
    .get(memberName, Number(inserted.lastInsertRowid)) as BookingRow;
  return rowToBooking(row);
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

export function listMenuItems(): MenuItem[] {
  const rows = getDb()
    .prepare('SELECT id, name, price, category, image, active FROM MenuItems ORDER BY category, name')
    .all() as { id: number; name: string; price: number; category: string; image: string; active: number }[];
  return rows.map(rowToMenuItem);
}

export function getActiveMenuItems(): MenuItem[] {
  return listMenuItems().filter((item) => item.active);
}

export function getMenuItemByName(name: string): MenuItem | null {
  const row = getDb()
    .prepare('SELECT id, name, price, category, image, active FROM MenuItems WHERE name = ?')
    .get(name) as
    | { id: number; name: string; price: number; category: string; image: string; active: number }
    | undefined;
  return row ? rowToMenuItem(row) : null;
}

export function createMenuItem(data: { name: string; price: number; category: string; image?: string }): MenuItem {
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
  if (getMenuItemByName(name)) {
    throw new MenuItemError(`An item named "${name}" already exists.`);
  }

  const result = getDb()
    .prepare('INSERT INTO MenuItems (name, price, category, image) VALUES (?, ?, ?, ?)')
    .run(name, price, category, image);
  return { id: Number(result.lastInsertRowid), name, price, category, image, active: true };
}

export function updateMenuItem(
  id: number,
  data: Partial<{ name: string; price: number; category: string; image: string; active: boolean }>
): MenuItem | null {
  const current = getMenuItemById(id);
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

  const clash = getMenuItemByName(next.name);
  if (clash && clash.id !== id) {
    throw new MenuItemError(`An item named "${next.name}" already exists.`);
  }

  getDb()
    .prepare('UPDATE MenuItems SET name = ?, price = ?, category = ?, image = ?, active = ? WHERE id = ?')
    .run(next.name, next.price, next.category, next.image, next.active ? 1 : 0, id);
  return getMenuItemById(id);
}

export function deleteMenuItem(id: number): boolean {
  const result = getDb().prepare('DELETE FROM MenuItems WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getMenuItemById(id: number): MenuItem | null {
  const row = getDb()
    .prepare('SELECT id, name, price, category, image, active FROM MenuItems WHERE id = ?')
    .get(id) as
    | { id: number; name: string; price: number; category: string; image: string; active: number }
    | undefined;
  return row ? rowToMenuItem(row) : null;
}

// ---- Game sessions ----

export function createGameSession(memberId: number, game: string, secret?: number): GameSession {
  const result = getDb()
    .prepare('INSERT INTO GameSessions (member_id, game, secret) VALUES (?, ?, ?)')
    .run(memberId, game, secret ?? null);
  return {
    id: Number(result.lastInsertRowid),
    member_id: memberId,
    game,
    secret: secret ?? null,
    moves: 0,
    status: 'active',
  };
}

export function getGameSession(id: number): GameSession | null {
  const row = getDb()
    .prepare('SELECT id, member_id, game, secret, moves, status FROM GameSessions WHERE id = ?')
    .get(id) as
    | { id: number; member_id: number; game: string; secret: number | null; moves: number; status: string }
    | undefined;
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

export function updateSessionMoves(id: number, moves: number): void {
  getDb().prepare('UPDATE GameSessions SET moves = ? WHERE id = ?').run(moves, id);
}

export function finishGameSession(id: number, status: 'won' | 'lost' | 'abandoned'): void {
  getDb().prepare('UPDATE GameSessions SET status = ? WHERE id = ?').run(status, id);
}
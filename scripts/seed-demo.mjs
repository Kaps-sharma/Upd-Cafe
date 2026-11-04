#!/usr/bin/env node
/**
 * Fill a database with demo data so the whole app can be shown in a viva
 * without typing anything in first.
 *
 *   npm run seed:demo            remove old demo rows, then insert fresh ones
 *   npm run seed:demo -- --clean remove the demo accounts and everything
 *                                that belongs to them, and nothing else
 *
 * Demo accounts all use the password `demo1234`:
 *   demo_ananya | demo_rahul | demo_meera
 *
 * Only rows owned by those three usernames are touched. Real accounts,
 * the menu and the store settings are never modified.
 */

import { randomBytes, scryptSync } from 'node:crypto';
import { loadEnv, createPool, readRepoFile } from './lib/env.mjs';

const DEMO_PASSWORD = 'demo1234';
const DEMO_USERNAMES = ['demo_ananya', 'demo_rahul', 'demo_meera'];

const MENU_SEED = JSON.parse(readRepoFile('lib/menu-seed.json'));
const cleanOnly = process.argv.includes('--clean');

const env = loadEnv();
const databaseUrl = env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error('\nDATABASE_URL is missing. Copy .env.example to .env.local first.\n');
  process.exit(1);
}

/** Salted scrypt hash, same format as `hashSecret()` in lib/db.ts. */
function hashSecret(secret) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(secret, salt, 64).toString('hex')}`;
}

/** Today's date in the cafe's time zone, plus an optional day offset. */
function cafeDate(timeZone, offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month, day] = parts.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}

function priceOf(name) {
  const item = MENU_SEED.find((entry) => entry.name === name);
  if (!item) throw new Error(`Menu seed is missing "${name}"`);
  return item.price;
}

const pool = createPool(databaseUrl);

try {
  const tableCheck = await pool.query("SELECT to_regclass('public.members') AS table");
  if (!tableCheck.rows[0]?.table) {
    console.error('\nThe database has no tables yet.');
    console.error('Run `npm run db:setup` first, then run this again.\n');
    process.exit(1);
  }

  if (cleanOnly) {
    const result = await pool.query('DELETE FROM members WHERE username = ANY($1) RETURNING id', [
      DEMO_USERNAMES,
    ]);
    console.log(`\nRemoved ${result.rowCount} demo account(s) and everything linked to them.\n`);
    process.exit(0);
  }

  const settings = await pool.query("SELECT value FROM settings WHERE key = 'timezone'");
  const timeZone = settings.rows[0]?.value || 'Asia/Kolkata';

  // 1. Make sure the menu exists. The app does this too; doing it here means a
  //    freshly created database can be seeded before the app has ever started.
  for (const item of MENU_SEED) {
    await pool.query(
      `INSERT INTO menu_items (name, price, category, image)
       VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING`,
      [item.name, item.price, item.category, item.image]
    );
  }

  // 2. Recreate the demo members from scratch so re-running is deterministic.
  await pool.query('DELETE FROM members WHERE username = ANY($1)', [DEMO_USERNAMES]);

  const passwordHash = hashSecret(DEMO_PASSWORD);
  const people = [
    { username: 'demo_ananya', name: 'Ananya Rao', email: 'ananya@example.com', money: 500, sc: 120 },
    { username: 'demo_rahul', name: 'Rahul Verma', email: 'rahul@example.com', money: 250, sc: 120 },
    { username: 'demo_meera', name: 'Meera Iyer', email: 'meera@example.com', money: 900, sc: 120 },
  ];

  const ids = {};
  for (const person of people) {
    const res = await pool.query(
      `INSERT INTO members (username, password_hash, consent_at, name, email, phone, money, sc)
       VALUES ($1, $2, now(), $3, $4, '', $5, $6)
       RETURNING id`,
      [person.username, passwordHash, person.name, person.email, person.money, person.sc]
    );
    ids[person.username] = res.rows[0].id;
  }

  // 3. A small coin history that explains the starting balance (20 + 100 = 120).
  for (const person of people) {
    await pool.query(
      `INSERT INTO coin_transactions (member_id, amount, reason, ref)
       VALUES ($1, 20, 'welcome', 'demo'), ($1, 100, 'game_win', 'demo')`,
      [ids[person.username]]
    );
  }

  // 4. Orders in three different states, so the admin board is not empty.
  const orders = [
    {
      username: 'demo_ananya',
      status: 'pending',
      orderType: 'dine_in',
      table: 'T3',
      note: 'Less sugar in the tea, please.',
      items: [
        { name: 'Tea', quantity: 2 },
        { name: 'Fang Cookies', quantity: 1 },
      ],
      hoursAgo: 0.2,
    },
    {
      username: 'demo_rahul',
      status: 'preparing',
      orderType: 'takeaway',
      table: '',
      note: 'Pack the burger separately.',
      items: [
        { name: 'Cobra Burger', quantity: 1 },
        { name: 'Coffee', quantity: 1 },
      ],
      hoursAgo: 3,
    },
    {
      username: 'demo_meera',
      status: 'completed',
      orderType: 'dine_in',
      table: 'T5',
      note: '',
      items: [
        { name: 'Shedded Pizza', quantity: 1 },
        { name: 'Venom Smoothie', quantity: 1 },
      ],
      hoursAgo: 26,
    },
  ];

  for (const order of orders) {
    const items = order.items.map((entry) => ({
      name: entry.name,
      price: priceOf(entry.name),
      quantity: entry.quantity,
    }));
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const createdAt = new Date(Date.now() - order.hoursAgo * 3600 * 1000).toISOString();

    await pool.query(
      `INSERT INTO orders
         (member_id, status, order_type, table_number, items, subtotal,
          coin_discount, total, coins_used, payment_method, note, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 0, $6, 0, 'wallet', $7, $8, $8)`,
      [
        ids[order.username],
        order.status,
        order.orderType,
        order.table,
        JSON.stringify(items),
        subtotal,
        order.note,
        createdAt,
      ]
    );
  }

  // 5. Two bookings: one for today, one for tomorrow (both in cafe time).
  const bookings = [
    {
      username: 'demo_ananya',
      date: cafeDate(timeZone),
      table: 'T3',
      capacity: 4,
      seats: 2,
      slotId: 'dinner2',
      slotLabel: '7:30 \u2013 9:00 PM',
    },
    {
      username: 'demo_rahul',
      date: cafeDate(timeZone, 1),
      table: 'T5',
      capacity: 6,
      seats: 4,
      slotId: 'lunch1',
      slotLabel: '12:00 \u2013 1:30 PM',
    },
  ];

  for (const booking of bookings) {
    await pool.query(
      `INSERT INTO bookings
         (member_id, table_number, table_label, capacity, seats, date, slot_id, slot_label)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (date, slot_id, table_number) WHERE status <> 'cancelled' DO NOTHING`,
      [
        ids[booking.username],
        booking.table,
        booking.capacity,
        booking.seats,
        booking.date,
        booking.slotId,
        booking.slotLabel,
      ]
    );
  }

  console.log('\nDemo data ready.');
  console.log('  Orders: 1 pending, 1 preparing, 1 completed');
  console.log(`  Bookings: today ${bookings[0].slotLabel}; tomorrow ${bookings[1].slotLabel}`);
  console.log('\nLog in at /login with any of these (password: demo1234):');
  for (const person of people) console.log(`  ${person.username.padEnd(14)} ${person.name}`);
  console.log('\nRemove the demo data again with:');
  console.log('  npm run seed:demo -- --clean\n');
} catch (error) {
  console.error('\nDemo seed failed.');
  console.error(String(error?.message ?? error));
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}

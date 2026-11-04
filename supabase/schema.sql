-- =============================================================================
--  Snake Cafe - database schema
-- =============================================================================
--  Setup (one time):
--    1. Supabase dashboard -> SQL Editor -> New query
--    2. Paste this whole file -> Run
--
--  This file is the ONLY place the schema is defined. If you change it here,
--  run it again (every statement is CREATE ... IF NOT EXISTS, so it is safe).
-- =============================================================================

-- ---------------------------------------------------------------- members ---
-- `username` is the member ID used to log in. `name` is only a display name,
-- so two members may share a display name but never a member ID.
-- Passwords are stored as a salted scrypt hash (salt:hash), never in plain text.
CREATE TABLE IF NOT EXISTS members (
  id            SERIAL PRIMARY KEY,
  username      TEXT,
  password_hash TEXT NOT NULL DEFAULT '',
  consent_at    TIMESTAMPTZ,                        -- when the member accepted the privacy policy
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  phone         TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  upi_id        TEXT NOT NULL DEFAULT '',
  money         NUMERIC(12,2) NOT NULL DEFAULT 0,   -- wallet balance in rupees
  sc            NUMERIC(12,2) NOT NULL DEFAULT 0,   -- loyalty coins
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration for databases created before member logins existed.
ALTER TABLE members ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_name_key;

-- Member IDs are case-insensitive ("Ananya" and "ananya" are the same ID).
CREATE UNIQUE INDEX IF NOT EXISTS members_username_key
  ON members (lower(username))
  WHERE username IS NOT NULL;

-- -------------------------------------------------------------- menu items ---
CREATE TABLE IF NOT EXISTS menu_items (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  price       NUMERIC(12,2) NOT NULL CHECK (price > 0),
  category    TEXT NOT NULL DEFAULT 'General',
  image       TEXT NOT NULL DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ orders ---
-- One row per order placed by a member. `items` is a JSONB array of
-- { name, price, quantity } so a historical order keeps the price it was sold at.
CREATE TABLE IF NOT EXISTS orders (
  id              SERIAL PRIMARY KEY,
  member_id       INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','preparing','ready','completed','cancelled')),
  order_type      TEXT NOT NULL DEFAULT 'dine_in'
                    CHECK (order_type IN ('dine_in','takeaway','delivery')),
  table_number    TEXT NOT NULL DEFAULT '',
  items           JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  coin_discount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  coins_used      NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method  TEXT NOT NULL DEFAULT 'wallet',
  note            TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------- coin ledger ---
-- Every coin a member earns or spends, so the balance is always explainable.
CREATE TABLE IF NOT EXISTS coin_transactions (
  id          SERIAL PRIMARY KEY,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL,      -- positive = earned, negative = spent
  reason      TEXT NOT NULL,               -- game_win | order_discount | admin_adjust | welcome
  ref         TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- bookings ---
CREATE TABLE IF NOT EXISTS bookings (
  id            SERIAL PRIMARY KEY,
  member_id     INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  table_number  TEXT NOT NULL,
  table_label   TEXT NOT NULL,
  capacity      INTEGER NOT NULL DEFAULT 2,
  seats         INTEGER NOT NULL DEFAULT 1,
  date          TEXT NOT NULL,
  slot_id       TEXT NOT NULL,
  slot_label    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed','seated','cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A table can only be booked once per date + time slot.
-- Cancelled bookings are ignored, so cancelling frees the table up again.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_no_double_booking
  ON bookings (date, slot_id, table_number)
  WHERE status <> 'cancelled';

-- ------------------------------------------------------------------ games ---
CREATE TABLE IF NOT EXISTS game_limits (
  member_id      INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  game           TEXT NOT NULL,
  plays          INTEGER NOT NULL DEFAULT 0,
  cooldown_until BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (member_id, game)
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id          SERIAL PRIMARY KEY,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  game        TEXT NOT NULL,
  secret      INTEGER,
  board       TEXT NOT NULL DEFAULT '',     -- server-authoritative game state
  moves       INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------- settings ---
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------- indexes ---
CREATE INDEX IF NOT EXISTS idx_orders_member   ON orders(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_date   ON bookings(date, slot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_member ON bookings(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_tx_member  ON coin_transactions(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_sessions   ON game_sessions(member_id, game, status);

-- A member can only ever have one live game of each type. Starting a new game
-- retires the old one, so nobody can open several sessions and brute-force a
-- secret number by guessing against all of them at once.
CREATE UNIQUE INDEX IF NOT EXISTS game_sessions_one_active
  ON game_sessions (member_id, game) WHERE status = 'active';

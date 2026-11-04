-- =============================================================================
--  Snake Cafe - reset script
-- =============================================================================
--  Run this in the Supabase SQL Editor when you want a clean slate.
--  It wipes every table (members, orders, bookings, ...) and leaves the
--  schema in place. The app re-seeds the menu and settings automatically
--  the next time it starts.
--
--  WARNING: this deletes all data. There is no undo.
-- =============================================================================

DROP TABLE IF EXISTS coin_transactions CASCADE;
DROP TABLE IF EXISTS orders            CASCADE;
DROP TABLE IF EXISTS bookings          CASCADE;
DROP TABLE IF EXISTS game_sessions     CASCADE;
DROP TABLE IF EXISTS game_limits       CASCADE;
DROP TABLE IF EXISTS menu_items        CASCADE;
DROP TABLE IF EXISTS members           CASCADE;
DROP TABLE IF EXISTS settings          CASCADE;

-- The old (pre-rework) schema used these CamelCase names. If you ever ran it,
-- drop it too so there is no leftover confusion.
DROP TABLE IF EXISTS "Transactions"  CASCADE;
DROP TABLE IF EXISTS "GameSessions" CASCADE;
DROP TABLE IF EXISTS "GameLimits"   CASCADE;
DROP TABLE IF EXISTS "MenuItems"    CASCADE;
DROP TABLE IF EXISTS "Bookings"     CASCADE;
DROP TABLE IF EXISTS "Members"      CASCADE;
DROP TABLE IF EXISTS "Settings"     CASCADE;

-- Then re-run schema.sql to recreate everything.

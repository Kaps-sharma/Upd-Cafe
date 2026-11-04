# CafeSuite — Rework Plan

Goal: turn the demo into something a real cafe can actually run, **without** turning it
into an enterprise project. Scope is deliberately small: 8 steps, each one shippable
on its own.

Decisions already locked in:

| Decision | Choice |
| --- | --- |
| Database | **Supabase Postgres only** (SQLite backend deleted) |
| Payments | **Keep the wallet + fake UPI flow** as-is (see caveat at the bottom) |

---

## The 8 steps

### Step 1 — Purge & unify the database  ✅ DONE
- Delete the whole SQLite backend (`node:sqlite`, `data/*.db`, every `ensure*Sync` migration helper).
- Delete the old `data/snake_cafe.db`.
- One schema file: `supabase/schema.sql` — paste once into Supabase → SQL Editor.
- `lib/db.ts` becomes a thin, typed Postgres layer (no dual backend, no `?` → `$n` converter).
- Fix the `timestamp` vs `created_at` bug that breaks order history on Postgres.
- Money becomes `NUMERIC(12,2)` instead of float; timestamps become real `TIMESTAMPTZ`.

**What actually landed:**

| Change | Detail |
| --- | --- |
| `lib/db.ts` | 1373 → ~900 lines. One `Pool`, one `Db` helper (`rows`/`one`/`exec`), a real `transaction()`, and native `$1` placeholders. |
| `supabase/schema.sql` | New. 8 tables: `members`, `menu_items`, `orders`, `coin_transactions`, `bookings`, `game_limits`, `game_sessions`, `settings`. |
| `supabase/reset.sql` | New. Drops everything (including the old CamelCase tables) for a clean re-run. |
| `data/snake_cafe.db` | **Deleted.** No local database any more. |
| `transactions` table | **Replaced by `orders`** — it now carries `status`, `order_type`, `table_number` so Step 2 has something to build on. |
| Money columns | `REAL` → `NUMERIC(12,2)`, plus a Postgres type parser so `NUMERIC` arrives as a JS number. |
| Timestamps | `TIMESTAMPTZ` everywhere, returned as ISO strings so the browser shows the customer's local time. |
| Double-booking | `bookings` now has a partial unique index — a table can never be booked twice for the same slot. |
| Coin ledger | `coin_transactions` table created **and written** — every coin earned/spent is now recorded. (Step 5 adds the UI + caps + expiry.) |
| Admin passcode | SHA-256 → **scrypt** with a per-hash salt. Old hashes are auto-upgraded on first boot so the admin panel never locks out. |
| `README.md` | Rewritten against the real setup: create Supabase project → paste `schema.sql` → `.env.local` → run. |
| `.gitignore` | Local-DB rules removed. |

**To verify Step 1:**
1. Supabase → SQL Editor → paste `supabase/schema.sql` → Run
2. `cp .env.example .env.local` and fill in `DATABASE_URL` (plus `SNAKE_CAFE_SECRET`)
3. `npm run dev`, sign up, and check that the **menu loads** and **/profile shows your order history** without errors

### Step 2 — Orders become real orders  ✅ DONE
- New `orders` table with a status lifecycle: `pending → preparing → ready → completed / cancelled`.
- Customer sees live order status; admin gets an order board to move tickets along.
- Order types: dine-in / takeaway / delivery, with the table attached to the order.
- Invoice numbers + printable receipt.

**What actually landed:**

| Change | Detail |
| --- | --- |
| `lib/orders.ts` | New. Client-safe order vocabulary — `Order`/`OrderLine`/`OrderStatus`/`OrderType`, the status labels and hints, the legal transition table (`ORDER_STATUS_FLOW`), and `orderNo()` (`#0001`). Shared by the server and the browser so both agree on what an order is. |
| `lib/db.ts` | `placeOrder` now takes `{ orderType, tableNumber, note }`, requires a table for dine-in, requires a saved address for delivery (and copies it into the note), and returns the order number, status and timestamp. Added `getOrder`, `getMemberOrders`, `getOpenOrders`, `getRecentClosedOrders`, `updateOrderStatus`, `cancelOrder`, plus a new `OrderError`. |
| Refunds | **Cancelling an order refunds everything**: `total` (rupees actually charged) goes back to the wallet, `coins_used` goes back to the coin balance, and an `order_refund` row is written to `coin_transactions`. `SELECT ... FOR UPDATE` stops a customer and an admin double-refunding the same order. |
| `getTransactions` / `Invoice` / `/api/transactions` | **Deleted.** `orders` is the single record of a sale now, so there is no second, parallel "invoice" code path to keep in sync. |
| New routes | `GET /api/orders` (a member's own orders), `GET`/`PATCH /api/orders/[id]` (one order, plus customer cancel), `GET /api/admin/orders` (open + recently closed), `PATCH /api/admin/orders/[id]` (advance or cancel). |
| `CartView` | Order-type picker (dine-in / takeaway / delivery) with hints, a table dropdown for dine-in, a 200-character note for the kitchen, and a confirmation screen that links straight to the order's tracking page. |
| `OrderTracker` + `/orders/[id]` | New. Four-step progress bar that polls itself while the order is open, itemised bill, kitchen note, a cancel button while still `pending`, and a **printable invoice**. |
| `AdminOrders` | New. A three-column **live order board** (New / Preparing / Ready) with counts, one-tap advance, a cancel that refunds, an auto-refresh every 8s, and a "recently closed" table. Wired into `AdminPanel` as the **default tab**. |
| `Profile` | Switched from invoices to orders: status badge, order type + table, per-order "Track order" / "View invoice" link, and `Refunded` instead of `Total paid` on cancelled orders. |
| `lib/tables.ts` | The two bar seats both had the label `'Bar '` (duplicate **and** missing its number) — now `Bar 1` and `Bar 2`, so the table dropdown is unambiguous. |
| `app/globals.css` | Status badges, order-type cards, the tracker timeline, the order board, and `@media print` rules that strip the chrome and hand the browser a clean invoice. |
| `scripts/static-check.ps1` | New, and wired to `npm run check:static`. Verifies bracket balance with a real lexer, that every local import resolves to a real export, and that every table `lib/db.ts` touches exists in `schema.sql`. No Node required. |
| `README.md` | New **Orders** section documenting the lifecycle, who may cancel what, and the refund rule. |

**To verify Step 2:**
1. Order something as a customer — pick **dine-in** and a table, add a note, pay.
2. You land on `/orders/<n>`: the progress bar shows *Placed* and fills in by itself within ~8s of a change.
3. Open **/admin** → the **Orders** tab is the default. The ticket is in **New**; press *Start preparing*, then *Mark ready*, then *Complete*. Watch the customer page follow along.
4. Cancel a *pending* order as the customer and check the profile: the wallet and coin balance are back where they started, and the order reads **Cancelled / Refunded**.
5. Press *Print invoice* on an order page — the header, nav and buttons disappear and only the bill is printed.

### Step 3 — Auth & security  ✅ DONE
- No more silent "Guest" member on write paths — ordering, booking and top-up require a real login.
- `SNAKE_CAFE_SECRET` becomes **required** in production (no public default). `secure` cookie flag.
- Admin passcode hashed with `scrypt` — **already done in Step 1**.
- Member login is now **member ID + password**, managed by the app itself (no Supabase Auth).
- Admin passcode login is throttled: 5 wrong attempts locks the panel for 15 minutes,
  and the counter survives restarts because it lives in the database.

**What actually landed:**

| Change | Detail |
| --- | --- |
| `members` table | New `username` (the member ID, case-insensitive unique) and `password_hash` columns. `name` is now only a display name. `supabase/schema.sql` migrates existing databases in place. |
| `lib/db.ts` | `hashSecret`/`verifySecret` (salted scrypt) now serve both member passwords and the admin passcode. Added `createMemberAccount`, `verifyMemberCredentials` and `MemberAuthError`. |
| `/api/auth` | No Supabase Auth calls. Sign-up validates the member ID, hashes the password, credits the welcome bonus and starts a session. Login compares the scrypt hash. |
| `/login` | Rebuilt with **Member ID** + **Password** (and confirm on sign-up), a show/hide-friendly validation flow, and a safe `?next=` return path. |
| Page gates | `/menu`, `/book`, `/games`, `/quiz`, `/guess`, `/tictactoe`, `/cart`, `/profile` and `/orders/[id]` call `requireMember()` and redirect to `/login?next=…`. |
| Guest fallback | Removed from `lib/auth.ts`. APIs now genuinely return **401** when nobody is signed in. Home `/` stays public. |
| Sessions | `secure` cookie in production; a missing `SNAKE_CAFE_SECRET` now throws a clear error instead of signing with a public default. |
| Admin lockout | Five wrong passcodes lock `/admin/login` for 15 minutes. The failure count and lock expiry are stored in the `settings` table, so a restart does not reset them. A successful login or passcode change clears them. |
| Buttons | Fixed the **Guess the Number** start button (it was disabled before the first allowance loaded) and made the quiz **Try again** button load a fresh round instead of resubmitting the same answers. |

**To verify Step 3:**
1. Log out, then open `/menu`, `/book` or `/games` — you are sent to `/login?next=…`.
2. Sign up with a member ID like `ananya_23` and a password of 8+ characters — you land back on the page you asked for, with the welcome bonus in the wallet.
3. Log out, log back in with the same ID and password. A wrong password is rejected.
4. Open `/profile` and confirm the **Member ID** is shown read-only while the display name stays editable.
5. As a signed-out visitor, `/` still loads normally and its header offers **Log in / Sign up**.
6. On `/admin/login`, enter a wrong passcode five times — the sixth attempt reports a 15-minute lockout, and the correct passcode is refused until it expires.

### Step 4 — Bookings done properly  ✅ DONE
- Cafe timezone setting (`timezone`, default `Asia/Kolkata`) — no more server-UTC date bugs.
- `UNIQUE(date, slot_id, table_number)` so a table can never be double-booked.
- Admin can cancel bookings; a cancelled slot frees the table.

**What actually landed:**

| Change | Detail |
| --- | --- |
| `lib/time.ts` | Dependency-free `Intl` helpers: `dateKeyInZone`, `timeKeyInZone`, `addDaysToDateKey`, `isValidDateKey`. Shared by the server and the browser. |
| Timezone | `getBookingWindow()` returns today, max date and the zone from the `timezone` setting. Availability, “slot already passed” and past-date checks all use it instead of `new Date().getHours()`. The admin **Store settings** tab can change the zone. |
| `/book` page | The server passes `today` / `maxDate` / `timeZone` to the booking UI, so the calendar opens on the cafe’s date even when the visitor’s device is in another time zone. The first still-bookable slot is selected automatically. |
| Double booking | The schema already had `bookings_no_double_booking`; the test run below confirms two members racing for the same table get a friendly error. Cancelling excludes the row from the index, so the slot frees up. |
| Admin bookings | New **Bookings** tab + `GET /api/admin/bookings` and `DELETE /api/admin/bookings/[id]`. Cancelled bookings stay in the member’s Dine-In history with a **Cancelled** badge. |

**To verify Step 4:**
1. Open `/book` — the date defaults to today in `Asia/Kolkata`, not the server’s UTC date, and a past lunch slot is skipped automatically.
2. Book a table, then have a second member try the same table and slot — the second attempt is refused with “Table … is already booked for …”.
3. In `/admin` → **Bookings**, cancel the booking. The same table appears free again on `/book`.
4. Check the member’s profile: the booking is still listed, marked **Cancelled**.

### Step 5 — Coins made honest  ✅ DONE
- **Member-visible ledger.** `GET`-free by design: `/profile` renders the last 25 rows of
  `coin_transactions` straight from the server, with a human label per reason
  (game win, order redemption, staff adjustment, welcome bonus).
- **Discount cap.** New admin setting **Maximum coin discount on a bill (%)**
  (`max_discount_percent`, default 50). The cart clamps the coin input to
  `total × cap`, and `placeOrder` re-checks it inside the order transaction — so even a
  forged request cannot make an order free.
- **One live session per game.** Partial unique index
  `game_sessions_one_active ON (member_id, game) WHERE status = 'active'`.
  Starting a game retires the previous one; re-opening **Guess the Number** resumes the same
  secret, so the 10 attempts cannot be reset by refreshing.
- **Server-authoritative tic-tac-toe.** The board is stored in `game_sessions.board`; the
  browser POSTs only `{ cell }` and the server plays the bot's reply. A client can no longer
  submit a winning board it did not play.
- **Expiry — deliberately not built.** Coins do not expire. Doing it properly needs
  per-transaction expiry dates and a derived balance, which is more machinery than a
  counter-service café needs; the cap already removes the “free food” risk.

**What landed**

| Area | Change |
| --- | --- |
| `lib/db.ts` | `getCoinTransactions`, `getActiveGameSession`, cap enforcement in `placeOrder`, `creditReward(…, ref)` records which game paid |
| `supabase/schema.sql` | `game_sessions_one_active` partial unique index |
| `app/profile/page.tsx`, `components/Profile.tsx` | Coin history card |
| `components/CartView.tsx` | Coin input clamped to the cap, cap shown next to the slider |
| `components/AdminPanel.tsx`, `app/api/admin/settings/route.ts` | Cap setting (0–100 %, validated) |
| `app/api/tictactoe/route.ts`, `components/TicTacToeGame.tsx` | Server-owned board and bot moves |
| `app/api/guess/start/route.ts` | Resumes the live session instead of minting a new secret |

**To verify Step 5:**
1. Play **Tic Tac Toe** with DevTools open — every click sends `{ cell }` and the response
   contains the whole board; edit the response in the Network tab and nothing changes,
   because the next move is re-validated against the stored board.
2. Click **Start** twice in **Guess the Number** — the second call returns the same `gameId`
   (`resumed: true`).
3. Win a game, open `/profile` — the win appears in the coin history with the game name.
4. Put something in the cart: the coin box refuses to go above the cap, and says
   “Coins can cover up to 50% of this bill”.
5. `/admin` → **Store settings** → set the cap to `0`, save, then try to use coins in the
   cart — the server refuses with “Loyalty coins cannot be used on this order.”

### Step 6 — Admin panel becomes the operations console  ✅ DONE
- ~~Live order board (the screen the kitchen watches).~~ — **done in Step 2.**
- **Members list with wallet/coin adjustment.** Search by name, member ID or phone; add or
  remove wallet money and coins. Coin changes write an `admin_adjust` row to
  `coin_transactions` with the staff note, so the member sees why the balance moved.
- **Today's bookings at a glance.** The Bookings tab opens with today's date, booking count,
  guest count and first/last arrival, followed by the reservations in time order. Cancelling
  still frees the table immediately.
- **Reports.** Sales today (orders, gross, collected, average ticket, coins redeemed),
  best-selling items today, and a last-7-days table. All day boundaries use the café time
  zone and cancelled orders are excluded.
- **GST rate + invoice settings.** Admin can set a GST percentage, a 14-digit FSSAI licence
  number and a one-line invoice footer. Menu prices are treated as GST-inclusive, so the
  invoice prints the tax share without changing what the member pays.

**What landed**

| Area | Change |
| --- | --- |
| `lib/db.ts` | `listMembersForAdmin`, `adjustMemberBalances`, `getTodayBookings`, `getSalesReport`; GST/FSSAI/footer in `getStoreSettings` |
| `lib/store.ts` | `StoreSettings.gstPercent`, `fssaiNumber`, `invoiceNote` |
| `app/api/admin/members/…`, `app/api/admin/reports` | Members list, balance adjustment and report endpoints |
| `app/api/admin/bookings/route.ts` | Also returns today's bookings block |
| `app/api/admin/settings/route.ts` | Validates GST (0–50 %), FSSAI (14 digits) and the footer (160 chars) |
| `components/AdminMembers.tsx`, `AdminReports.tsx`, `AdminBookings.tsx` | New tabs and today-at-a-glance card |
| `components/OrderTracker.tsx`, `app/orders/[id]/page.tsx` | GST share, FSSAI number and invoice footer on the printed invoice |

**To verify Step 6:**
1. `/admin` → **Members** → search for a member, click **Adjust**, add ₹100 and 200 coins with
   a note. Open that member’s `/profile`: the coin history shows “Adjusted by staff”.
2. Try to remove more coins than the member has — the server refuses.
3. `/admin` → **Bookings**: today’s date, guest count and arrivals appear above the list.
4. `/admin` → **Reports**: place an order, refresh, and watch orders, average ticket and the
   best-seller list update.
5. `/admin` → **Store settings**: set GST to `5`, FSSAI to a 14-digit number and an invoice
   footer, save, then open any order’s invoice — the tax share and footer are printed.

### Step 7 — Real-world compliance & polish  ✅ DONE
- GST on the bill + GSTIN + FSSAI licence number in the footer.
- Privacy policy + DPDP consent + a "delete my data" action.
- Remove the **fake reviews** and fake address/phone from the landing page.
- QR code per table (`/menu?table=T3`) + installable PWA.

**What landed**

| Area | Change |
| --- | --- |
| `lib/store.ts`, `lib/db.ts` | `StoreSettings.gstin`; the setting is seeded, read and upper-cased automatically |
| `app/api/admin/settings/route.ts` | Validates an optional 15-character GSTIN (`07ABCDE1234F1Z5` format) |
| `components/AdminPanel.tsx` | GSTIN field beside the GST rate and FSSAI number |
| `components/OrderTracker.tsx` | Invoice footer prints `GSTIN` above the FSSAI licence and footer note |
| `app/privacy/page.tsx` | Plain-language privacy policy: what is collected, why, DPDP consent, retention, rights, deletion |
| Sign-up | A required privacy-policy checkbox; the API refuses sign-up without consent and stores `members.consent_at` |
| Delete my data | `DELETE /api/profile` (password-confirmed) deletes the member row; `ON DELETE CASCADE` removes orders, bookings, coin history and game sessions |
| `components/Profile.tsx` | **Privacy & data** card with the policy link and a password-confirmed delete action |
| `app/page.tsx` | Fake reviews and the fake address, phone and email are gone; the footer links to the real privacy policy |
| `/menu?table=T3` | The table from a scanned code is validated, shown in a banner, remembered for the visit and preselected at checkout |
| `app/admin/tables/page.tsx` | Printable QR card per table, generated locally with the `qrcode` package; links use `NEXT_PUBLIC_SITE_URL` or the current host |
| PWA | `public/manifest.webmanifest`, 192/512 icons, an offline page and a minimal service worker that caches only static assets, never pages or API data |

**To verify Step 7:**
1. `/admin` → **Store settings**: enter a GSTIN such as `07ABCDE1234F1Z5`, save, and open an order invoice — GSTIN, FSSAI and footer print together.
2. Sign up: the **privacy policy** checkbox is required; leaving it unchecked is refused by the server as well. The policy opens at `/privacy`.
3. `/profile` → **Privacy & data** → enter your password and delete the account. You are signed out, and the member, orders, bookings and coin history are gone.
4. Open `/` — there are no customer reviews and no invented address or phone number.
5. `/admin` → **Table QR**: print the cards. Scan one, or open `/menu?table=T3`, and the menu shows “Ordering for T3”; checkout has T3 preselected.
6. Open the site in Chrome on localhost/HTTPS: the install icon appears, and `public/offline.html` is shown when the network drops.

### Step 8 — Docs & deploy  ✅ DONE
- Rewrite `README.md` against the real app.
- One-command Supabase setup + Netlify deploy instructions.
- Demo seed script.

**What landed**

| Area | Change |
| --- | --- |
| `scripts/db-setup.mjs` | `npm run db:setup` applies `schema.sql`; `npm run db:reset` wipes every table first |
| `scripts/seed-demo.mjs` | `npm run seed:demo` creates three demo members, three orders and two bookings; `--clean` removes only those rows |
| `scripts/lib/env.mjs` | Shared `.env.local` reader and single-connection pool used by all three scripts |
| `lib/menu-seed.json` | The starter menu moved out of TypeScript so the seed script reads the same list (no second copy to drift) |
| `README.md` | Setup reordered around the commands, new **Deploy** section (Netlify env vars, build, QR links), demo accounts and updated project map |
| `netlify.toml`, `.gitignore` | Environment comments match the real variables; `*.tsbuildinfo` ignored |

**To verify Step 8:**
1. `npm run db:setup` on an empty Supabase project prints all 8 tables.
2. `npm run seed:demo`, then sign in as `demo_ananya` / `demo1234`: the profile shows ₹500,
   120 coins and one pending order.
3. `npm run seed:demo -- --clean` removes the three demo accounts and nothing else.
4. Follow the **Deploy** section of the README: add the four environment variables in
   Netlify and check that `/admin` opens on the deployed URL.

---

## ⚠️ One honest caveat

Step 1 keeps the **fake UPI top-up** exactly as you asked. That means `POST /api/topup`
still credits money without a real payment — anyone can type `x@y` and add ₹100,000 to a
wallet. It is fine for a college demo and for you testing it yourself.

Before a **real** cafe puts real money through it, that endpoint has to be swapped for
Razorpay/Cashfree with server-side webhook verification (roughly half a day of work, and
it is the only thing in this plan that needs a payment provider account).

Everything else in this plan is safe to ship to a real cafe as-is.

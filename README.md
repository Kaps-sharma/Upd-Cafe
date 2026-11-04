# CafeSuite

A cafe ordering + loyalty + table-booking app built with Next.js.

Members sign up with a member ID and password, top up a wallet, order from the menu,
book a table, and earn **Snake Coins** by playing games. Coins work as a discount at
checkout.

> **Status:** all eight rework phases are complete and the app is ready for a
> pilot deployment. See [docs/REWORK-PLAN.md](./docs/REWORK-PLAN.md) for the
> phase-by-phase breakdown and [docs/PROJECT-DOC.md](./docs/PROJECT-DOC.md) for
> the short project summary.

---

## Stack

- **Next.js 15 (App Router)** + **React 19** + **TypeScript**
- **Supabase Postgres** for the database — one schema, defined in `supabase/schema.sql`
- Built-in member login with a **member ID + password** (scrypt hashes, HMAC-signed cookies)
- Cookie-based app sessions (HMAC-signed)
- Menu, currency and store settings live in the database and are admin-editable

There is no local database file any more. Everything lives in Supabase.

---

## Requirements

- Node.js 20 or later
- A free [Supabase](https://supabase.com) project

---

## Getting started

### 1. Install

```sh
npm install
```

### 2. Configure the environment

```sh
cp .env.example .env.local
```

Then fill in `.env.local`:

| Variable | Where to get it | Required |
| --- | --- | --- |
| `DATABASE_URL` | Supabase → **Connect** button → **Session pooler** → URI | **yes** |
| `SNAKE_CAFE_SECRET` | any long random string — `openssl rand -hex 32` | **yes** in production |
| `SNAKE_CAFE_ADMIN_PASSCODE` | your admin passcode (default `admin123`) | recommended |
| `NEXT_PUBLIC_SITE_URL` | your public domain, e.g. `https://cafe.example.com` | for printed table QR codes |

> **Which connection string?** Use the **Session pooler (port 5432)**, not the transaction
> pooler (6543) — transaction mode does not support prepared statements, which the `pg`
> driver requires. The session pooler is also IPv4-only, so the *same* string works on
> your laptop and on Netlify. No `sslmode` parameter needed; TLS is already configured.

### 3. Create the database

One command creates every table:

```sh
npm run db:setup
```

It runs [`supabase/schema.sql`](./supabase/schema.sql) against the database in
`.env.local`. Every statement is `CREATE ... IF NOT EXISTS`, so running it again is safe.

Prefer the Supabase dashboard? Open **SQL Editor → New query**, paste the whole of
[`supabase/schema.sql`](./supabase/schema.sql) and click **Run** — it is the same thing.

> **Starting over?** `npm run db:reset` drops every table (including the old CamelCase
> ones from the previous version) and recreates the schema. It deletes all data.

### 4. Optional: load demo data

For a viva or a screenshots run, this fills the app with three demo members, three orders
in different states and two bookings:

```sh
npm run seed:demo
```

| Member ID | Password | Name |
| --- | --- | --- |
| `demo_ananya` | `demo1234` | Ananya Rao |
| `demo_rahul` | `demo1234` | Rahul Verma |
| `demo_meera` | `demo1234` | Meera Iyer |

Only those three usernames are touched; real members, the menu and the store settings are
never changed. Remove the demo rows again with `npm run seed:demo -- --clean`.

### 5. Check everything is wired up

```sh
npm run check:db
```

This connects to Postgres, confirms every table from `schema.sql` exists, and checks
that the member ID/password columns are ready. It prints exactly what is wrong if
something is off, and never prints your secrets.

### 6. Run

```sh
npm run dev
```

Open http://localhost:3000, go to **Log in / Sign up**, and create a member account
with a member ID and password.

Production build:

```sh
npm run build
npm start
```

---

## Deploy

For a college submission the whole stack can run for free:

| Piece | Service | Free plan |
| --- | --- | --- |
| Code | GitHub | free repository |
| App | **Vercel Hobby** | 100 GB transfer, 1M function calls, 100 deploys/day, non-commercial |
| Database | Supabase | 500 MB, pauses after 7 days of low activity |

**Vercel is the easiest host for this app** — it is made by the Next.js team, needs no
configuration, and runs route handlers as serverless functions.

### Vercel (recommended)

1. Push the repository to GitHub (`.env.local` is gitignored, so secrets are not uploaded):

   ```sh
   git add -A
   git commit -m "Finish CafeSuite rework"
   git push origin main
   ```

2. At [vercel.com](https://vercel.com) sign in with GitHub and choose **Add New → Project**,
   then import the repository. Keep the detected settings: framework **Next.js**,
   build command **`npm run build`**, Node version from `.nvmrc` (22).

3. Add these under **Environment Variables** (Production and Preview):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | the same Supabase session-pooler URI from `.env.local` |
   | `SNAKE_CAFE_SECRET` | a new long random string (`openssl rand -hex 32`) |
   | `SNAKE_CAFE_ADMIN_PASSCODE` | a passcode you choose — not `admin123` |
   | `NEXT_PUBLIC_SITE_URL` | `https://<project>.vercel.app` |

   You can leave `NEXT_PUBLIC_SITE_URL` blank for the first deploy, then add it with the
   real domain and redeploy. It is baked in at build time.

4. Press **Deploy**. No database migration runs at deploy time — the Supabase project
   already holds the schema and data.

5. Open the deployed URL, sign in at **/admin** and change the admin passcode (the one
   stored in the database, not the environment variable), then print the table QR cards
   from **Admin → Table QR**.

Every later `git push` redeploys automatically.

### Netlify (alternative)

The repo also contains [`netlify.toml`](./netlify.toml). Import the repo the same way,
keep the detected Next.js settings and add the same four environment variables with
`NEXT_PUBLIC_SITE_URL` set to `https://<site>.netlify.app`. Netlify's free plan is
credit-based, so Vercel is the safer choice for a long-running demo.

> **Supabase pauses free projects after about a week of inactivity.** If the site shows
> a database error after a break, open the Supabase dashboard, click **Resume project**,
> and reload. Do this the morning of a viva. A few requests a day is usually enough to
> keep it awake.

Before a real café takes live money, replace the simulated top-up with a payment gateway —
see **Notes** at the bottom.

---

## Currency system

Balances and prices use a configurable coin currency, like Flipkart SuperCoins:

| Field             | Default       | Admin-editable |
| ----------------- | ------------- | -------------- |
| Store name        | Your café (configurable) | Yes |
| Currency name     | Snake Coins   | Yes            |
| Currency symbol   | SC            | Yes            |
| Welcome bonus     | ₹20           | Yes            |
| Max coin discount | 50% of a bill | Yes            |

**100 Snake Coins = ₹1 off.** The admin can rename the store, change the currency to
anything ("Cafe Points", "Venom Coins", "Byte Cash" ...), and change the welcome bonus —
all live, no redeploy required.

### The coin ledger

Every coin that is earned or spent is written to `coin_transactions` with a reason
(`game_win`, `order_discount`, `admin_adjust`) and a reference, so the balance on a member
card can always be explained. Members see the history on **/profile**.

Two rules keep the coins honest:

- **Discount cap.** Coins can pay for at most the admin-set share of an order
  (`max_discount_percent`, default 50%). The rest must come from the wallet, so a lucky game
  can never make an order free. The cart clamps the input and the server re-checks it inside
  the order transaction.
- **One live game per member.** Each game has a single active session row (enforced by a
  partial unique index), and tic-tac-toe's board lives on the server — the browser only sends
  the square it wants to play. Re-opening a game resumes it instead of granting fresh tries.

---

## Admin panel

Go to **/admin** and sign in with the admin passcode (default `admin123`).

You can:
- Work the **live order board** - New / Preparing / Ready columns with a running
  count, one-tap status advance, and a cancel button that refunds the customer
- See **today's bookings** at a glance — date, booking count, guest count and first/last
  arrival — then cancel any reservation to free the table
- Search the **members** list and adjust a wallet balance or coin balance; coin changes are
  written to the member's coin history with your note
- Read **reports**: sales today, average ticket, coins redeemed, best-selling items and the
  last seven days
- Change the store name, currency name, currency symbol, welcome bonus, coin discount cap,
  GST rate, GSTIN, FSSAI licence number and invoice footer
- Print a **QR card for every table** from the **Table QR** tab
- Add, edit (inline), activate/deactivate and delete menu items
- Change the admin passcode

The board refreshes by itself every few seconds, so a till screen can be left open.

### Invoices and GST

Menu prices are treated as **GST-inclusive**. The admin sets the GST rate under **Store
settings**, and every invoice prints the tax share that is already inside the total — the
member is never charged extra at checkout. An optional GSTIN, FSSAI licence number and
invoice footer are printed under the total as well, so the bill carries the details a
café is expected to show.

---

## Privacy, consent and deleting an account

The policy at **/privacy** explains what the app stores (member ID, display name, optional
phone/address, orders, bookings, coin history and game sessions), why it is needed, how long
it is kept and who can see it.

Creating an account requires ticking the privacy-policy box. The server records the consent
time in `members.consent_at` and refuses a sign-up that did not send consent. Under the DPDP
Act, consent can be withdrawn at any time by deleting the account.

To delete your data, open **Profile → Privacy & data**, enter your password and press
**Delete my account & data**. The member row is deleted and the database's
`ON DELETE CASCADE` rules remove that member's orders, bookings, coin history and game
sessions. You are signed out immediately. Café staff can do the same for a member on request.

---

## Table QR codes and installing the app

**Table QR.** In **Admin → Table QR** every table gets a printable card pointing at
`/menu?table=T3`. Scanning it opens the menu with that table selected; the table is remembered
for the visit and preselected in the cart. The links use `NEXT_PUBLIC_SITE_URL` when it is set,
otherwise the host you are currently browsing.

**PWA.** The app ships a web manifest, 192/512 px icons, an offline page and a small service
worker. On HTTPS (or `localhost`) Chrome and Safari offer **Add to Home Screen**. The service
worker caches only the install shell and Next.js static files — never pages or API responses —
so one member's profile cannot be served from another member's cache.

---

## Orders

An order is a real, trackable record, not just a receipt.

**Placing one.** In the cart the customer picks how they want it — **dine-in**
(and which table), **takeaway**, or **delivery** (which uses the address saved on
their profile) — and can add a short note for the kitchen. Payment comes out of
the wallet at that moment, with any coin discount applied.

**Lifecycle.**

```
pending ──▶ preparing ──▶ ready ──▶ completed
   │            │           │
   └────────────┴───────────┴──────▶ cancelled
```

- **pending** — the order is in, the kitchen has not started it
- **preparing** — being made
- **ready** — waiting to be served or collected
- **completed** — closed
- **cancelled** — closed, and **everything paid is refunded**: the rupees go back
  into the wallet and the coins go back into the coin balance, with a matching
  `order_refund` row in `coin_transactions`

**Who can do what.** Staff can move an order along any legal step and cancel
anything that is not already closed. A customer can only cancel their own order,
and only while it is still `pending` — once the kitchen starts, they have to ask
staff.

**Tracking.** Every order has a page at `/orders/<id>` showing a four-step
progress bar that updates on its own, plus a printable invoice. It is linked from
the confirmation screen and from the order list on the profile page.

---

## Table bookings

Members pick seats, a date and a time slot, then choose a table from a visual floor
plan. The floor plan only shows tables that are free for that slot and big enough.

**No double bookings.** A unique index in Postgres (`date + slot + table`) makes it
impossible for two people to hold the same table at the same time, even if they click
at the same instant. The second request gets a clear "already booked" message.

**Correct dates.** All "is this today?" and "has this slot passed?" checks run in the
cafe's time zone (`Asia/Kolkata` by default), not the server's. Set yours in
**Admin → Store settings → Cafe time zone**. The booking page also opens on the
cafe's today, so a visitor whose phone is in another time zone still sees the right
calendar.

**Cancelling.** Staff can cancel any upcoming booking from **Admin → Bookings**. The
table becomes free immediately, and the member still sees the booking in
**Profile → Dine-In history**, marked *Cancelled*.

---

## Project layout

```
app/                  API routes + pages
  api/
    admin/            Admin-only APIs (orders, bookings, members, reports, settings, menu CRUD, passcode)
    auth/             Sign up / log in (member ID + password)
    order/            Place an order (wallet + coin balance check)
    orders/           A member's own orders, and one order by id (+ cancel)
    book/             Table bookings + availability
    quiz/ guess/ tictactoe/   Games (server-graded)
    ...
  admin/              Admin login + orders + bookings + members + reports + settings
  admin/tables/       Printable QR card for every table
  menu/ cart/         Menu browsing + cart + checkout (table QR: /menu?table=T3)
  orders/[id]/        Live order status + printable invoice
  book/               Table booking with floor plan
  games/ quiz/ guess/ tictactoe/   The games
  profile/            Wallet, order history, bookings, delete-my-data
  privacy/            Privacy policy and DPDP consent details
components/           Client-side UI components
public/               PWA manifest, icons, service worker, offline page
lib/
  db.ts               Postgres layer (queries, transactions, seeding)
  auth.ts             Member + admin session management
  orders.ts           Order status/type vocabulary shared by server + browser
  menu.ts             Starter menu (re-exports menu-seed.json)
  menu-seed.json      Starter menu data, also read by the demo seed script
  games.ts            Quiz, guess number, tic tac toe shared logic
  store.ts            Client-safe types + formatting helpers
  time.ts             Cafe-time-zone calendar helpers shared by server + browser
  tables.ts           Floor plan + time slots
supabase/
  schema.sql          The database schema - run this once
  reset.sql           Wipe everything and start over
docs/
  REWORK-PLAN.md      The 8-step rework plan and what landed in each step
  PROJECT-REPORT.md   Full project report and status
  PROJECT-DOC.md      One-page project summary
  synopsis/           Word + PDF synopsis for submission
scripts/
  lib/env.mjs         Shared .env reader and Postgres pool for the scripts
  db-setup.mjs        Applies schema.sql (npm run db:setup / db:reset)
  seed-demo.mjs       Demo members, orders and bookings (npm run seed:demo)
  check-db.mjs        Connectivity + schema health check (npm run check:db)
  static-check.ps1    Offline sanity check (npm run check:static)
```

---

## Notes

- `npm run db:setup` applies `supabase/schema.sql`; `npm run db:reset` wipes every table
  first. `npm run seed:demo` adds demo data and `--clean` removes it again.
- `supabase/schema.sql` is the single source of truth for the database. Every statement
  is `CREATE ... IF NOT EXISTS`, so you can safely re-run it.
- Money is stored as `NUMERIC(12,2)` and timestamps as `TIMESTAMPTZ`, so nothing is
  rounded in the database and the browser renders times in the visitor's own timezone.
- `orders` is the single record of a transaction — `total` is the amount actually
  charged (subtotal minus the coin discount), so refunding `total` plus `coins_used`
  puts back exactly what was taken.
- The admin passcode is stored as a salted **scrypt** hash, never in plain text.
  Five wrong passcodes lock the admin login for 15 minutes; the counter is stored in
  the database, so restarting the app does not clear it.
- Member passwords are stored as salted **scrypt** hashes too. Menu, booking and game
  pages redirect to `/login` until a member signs in.
- `npm run check:static` is an offline check (no Node needed) that verifies bracket
  balance, that every local import resolves, and that every table used by `lib/db.ts`
  exists in the schema. Handy before a build.
- **Known gap:** the "add money" top-up is a simulated UPI payment — it credits the wallet
  without contacting a real payment gateway. That is fine for a demo, but it must be
  replaced with a real gateway (Razorpay/Cashfree) before a real cafe takes real money.

# CafeSuite — Project Report

> Fill-in fields for the minor project submission.
> Written to match the code that actually exists in this repository.

---

## 1. Project Type

**Minor Project — Full-Stack Web Application (Software Development)**

- **Domain:** Software Engineering / Full-Stack Web Development
- **Application type:** Responsive Progressive Web App (installable on any phone, tablet or desktop browser)
- **Deployment model:** Cloud-hosted (Netlify serverless functions + Supabase managed Postgres)
- **Licensing model:** Zero-cost — runs entirely on free-tier infrastructure

---

## 2. Title of the Project

### **CafeSuite — A Digital Ordering, Loyalty and Table-Reservation Platform for Small Cafés**

**Tagline:** *A café's ordering counter, loyalty programme and reservation book — in one web app that costs nothing to run.*

**Alternative titles** (if a shorter or more academic variant is preferred):

| Variant | Title |
| --- | --- |
| Academic | *A Cloud-Based Ordering and Customer Retention System for Small Food-Service Enterprises* |
| Descriptive | *CafeSuite: An Integrated Café Ordering, Loyalty-Reward and Table-Booking Web Application* |
| Business-style | *CafeSuite — Digitising the Order-to-Rebook Loop for Independent Cafés* |

---

## 3. Problem Statement

### 3.1 The context

India has an estimated **2–3 lakh independent cafés and small food-service outlets**, the overwhelming majority of which are single- or two-person operations. They are the backbone of the café culture in tier-2 and tier-3 cities, yet almost none of them use any form of digital ordering or customer-retention software.

### 3.2 The core problem

> **Small cafés have no affordable, low-friction digital system to take orders, manage table reservations, and bring customers back — so they lose both revenue and regulars.**

This breaks down into five concrete sub-problems:

**(a) Ordering and billing are manual and error-prone.**
Orders are taken verbally or from handwritten paper notes. Item-level miscommunication (wrong size, wrong quantity, wrong modifiers) leads to wrong bills, refund arguments, and wasted food. There is no digital record of what was sold, so the owner cannot analyse demand, identify best-sellers, or measure day-to-day performance.

**(b) There is no customer-retention mechanism.**
Cafés that offer loyalty programmes rely on branded apps and plastic loyalty cards. For an independent café, setting one up is uneconomical and operationally heavy. Consequently, the average café has **no way to know that a customer visited last week**, no way to reward them, and no way to invite them back. The repeat-customer relationship — the single most valuable asset in food service — is left to chance and memory.

**(c) Table reservations happen over phone calls and WhatsApp messages.**
These are error-prone, hard to track, and invisible to the manager. Two parties routinely arrive to find the same table already taken, or the café loses walk-in revenue because it cannot see which tables are free. There is no single source of truth for reservations.

**(d) Off-the-shelf software is aimed at the wrong customer.**
Commercial café systems (Petpooja, Posist, Oracle MICROS, Square) are built for multi-outlet chains and high transaction volumes. They carry per-outlet licensing, require dedicated hardware (thermal printers, cash drawers, POS terminals), demand staff training, and assume a permanent internet connection and a full-time operator. **For a two-person café, the cost and complexity exceed the benefit**, so the software is simply not adopted.

**(e) Customers get no visibility.**
Even where a café has a digital menu or social-media presence, the customer cannot see whether their order is being prepared, cannot reserve a table with certainty, and cannot review what they have ordered or spent.

### 3.2 What is actually needed (the design brief)

The analysis above shows that a small café does **not** need an ERP, a supply-chain module, or a multi-terminal POS. It needs exactly four things, on any device, at essentially zero cost:

1. **Take an order and record it correctly.**
2. **Let the customer reserve a table without double-booking it.**
3. **Reward repeat customers automatically** so they have a reason to return.
4. **Let the owner see the menu, the orders and the reservations**, from a phone.

### 3.3 The gap this project fills

Existing solutions sit at one of two extremes: **free consumer apps** (Zomato, Swiggy) that take a commission from the café and do not retain the customer relationship, or **expensive enterprise POS systems** that small outlets cannot justify. There is a clear gap in between — **a self-hosted, zero-licence, single-café tool that the owner controls and that keeps the customer relationship**.

CafeSuite is designed to occupy exactly that gap.

---

## 4. Methodology

The project was built using an **incremental, verify-after-every-layer** approach: each phase produced a runnable artefact that was tested before the next phase began. Six phases were executed.

### Phase 1 — Requirement gathering and deliberate scope reduction

Requirements were derived from café-side interviews and observation of manual counter operations, then **deliberately reduced**. The guiding principle was: *if a feature does not let a café take money, keep a customer, or save operator time, it is cut.*

Two technologies were chosen to reduce complexity rather than add it:

- **A single backend.** The prototype originally carried two parallel database backends (embedded SQLite for local runs and PostgreSQL for hosted runs), with separate schema definitions, a placeholder-rewriting layer and ~14 migration helpers. This dual-backend design was the single largest source of latent defects. It was removed entirely in favour of **one PostgreSQL database with one schema file**, roughly halving the data-access layer.
- **No heavyweight framework on the client.** React with plain CSS, no UI kit, no state-management library — reducing dependency surface and keeping the app fast on low-end phones.

### Phase 2 — Data model design

The database schema was designed **before** any application code, and written as a single, version-controlled source of truth (`supabase/schema.sql`) rather than as application-driven migrations.

| Table | Purpose |
| --- | --- |
| `members` | Customer accounts, wallet balance, loyalty coin balance |
| `menu_items` | Products, prices, categories, images, active/inactive flag |
| `orders` | Every order, with status, order type, table number, itemised JSON line items |
| `coin_transactions` | Append-only ledger of every loyalty coin earned and spent |
| `bookings` | Table reservations, with a partial unique index preventing double-booking |
| `game_limits` | Per-member daily play limits and cooldowns for the reward games |
| `game_sessions` | Server-side game state |
| `settings` | Admin-editable store name, currency, welcome bonus, tax rates |

Key modelling decisions:

- **Money is stored as `NUMERIC(12,2)`, never floating point.** Floating-point arithmetic silently corrupts currency values; a custom PostgreSQL type parser was added so exact decimals arrive in JavaScript as plain numbers without scattering `Number()` calls through the codebase.
- **Historical orders store their own prices.** Line items are persisted as JSONB with the price *at the time of sale*, so a later menu price change never rewrites past revenue figures.
- **Double-booking is prevented by the database, not the application.** A partial unique index on `(date, slot_id, table_number) WHERE status <> 'cancelled'` makes it *impossible* for two customers to claim the same table and slot, even under concurrent requests — something application-level "check-then-insert" logic cannot guarantee.

### Phase 3 — Backend and data-access layer

A single typed data-access module (`lib/db.ts`) was written over a managed PostgreSQL connection pool, providing a small explicit API (`rows` / `one` / `exec` / `transaction`) and **real database transactions** using native `$1` parameter placeholders.

Transactional integrity was enforced on all money-handling paths: an order placement reads the member's wallet and coin balances, validates them, writes the debited balances, inserts the order and appends the coin-ledger entry **as one atomic unit**. If any step fails, the whole operation rolls back — a customer can never be charged without an order existing.

### Phase 4 — Frontend and user experience

The customer-facing interface was built as responsive pages: menu browsing with category filtering, a cart, checkout, table booking with a visual floor plan and time slots, a profile page (wallet, coin balance, order history, reservations), and three reward games. The owner-facing admin panel provides menu CRUD with inline editing, store and currency settings, and passcode management.

A deliberate design choice was **configurability of currency**: the coin currency's name, symbol, store name and welcome bonus are admin-editable at runtime, so a café can rebrand the loyalty programme ("Cafe Points", "Venom Coins", "Byte Cash") without a code change or redeployment.

### Phase 5 — Security and reliability

| Concern | Measure implemented |
| --- | --- |
| Password storage | Application-managed salted **scrypt** hashes in the members table; plain text is never stored |
| Session integrity | HMAC-signed, HTTP-only session cookies |
| Admin authentication | Passcode hashed with **scrypt** and a per-hash random salt; compared with a constant-time equality check |
| Secret management | Session-signing secret configurable via environment variable, with no hard-coded production default |
| SQL injection | Exclusively parameterised queries throughout; no string interpolation of user input into SQL |
| Top-up abuse | Simulated wallet top-up is explicitly labelled as a demonstration flow and documented for replacement by a real gateway before live use |
| Game integrity | Play limits and cooldowns enforced server-side per member, so reward limits cannot be bypassed client-side |

### Phase 6 — Verification and deployment

Correctness was checked by **static verification** before deployment: automated cross-checks that every symbol imported from the data layer resolves to an actual export, that every table referenced in SQL exists in the schema, and that the module is structurally balanced. A dedicated **automated health-check script** (`npm run check:db`) was added that verifies environment configuration, opens a live database connection, confirms every table exists, checks seed data, and pings the authentication endpoint — printing exactly what is wrong and never printing secrets.

Deployment is to a serverless host (Netlify) with the database on Supabase's managed PostgreSQL, using the **session connection pooler** so that a single connection string works on both a developer's laptop and a serverless runtime.

### Technology stack

| Layer | Technology | Rationale |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) | Server components + API routes in one deployable unit |
| Language | TypeScript (strict) | Compile-time safety on money and state logic |
| UI | React 19 | Component model |
| Database | Supabase PostgreSQL | Managed, free tier, supports transactions, constraints and JSONB |
| Authentication | Member ID + password (salted scrypt, HMAC-signed cookies) | Self-contained; no external auth service or password handling burden on the café |
| DB driver | `pg` (node-postgres) | Supports transactions and prepared statements |
| Styling | Plain CSS | No framework dependency; fastest on low-end devices |
| Hosting | Netlify (serverless) | Free tier, auto-scaling, HTTPS by default |

---

## 5. Expected Outcome

### 5.1 Functional outcome

A working, deployed, full-stack web application delivering the four capabilities identified in the problem statement:

1. **Customers** can register, browse a live menu, add items to a cart, check out using their wallet, reserve a table against a visual floor plan, and earn loyalty coins by playing games.
2. **The café owner** can manage the menu in real time (add, edit, deactivate, delete), monitor orders and reservations, adjust a member's wallet or coin balance, and change store, currency, tax and licence settings — **from a phone**.
3. **The system is trustworthy for money**: exact decimal arithmetic, atomic transactions, a complete coin ledger, and database-level guarantees against double-booking.

### 5.2 Non-functional outcome

| Attribute | Target |
| --- | --- |
| Cost to a café | **₹0** — Supabase free tier + Netlify free tier |
| Hardware required | None — any modern phone or browser |
| Devices supported | Any phone, tablet or desktop browser; installable as a PWA |
| Availability | Cloud-hosted, auto-scaling, HTTPS by default |
| Performance | Server-rendered pages; static delivery for the public menu |
| Maintainability | One schema file as the single source of truth; one typed data-access module; no duplicated backend logic |

### 5.3 Academic and skill outcome

- Full-stack competence across a server-rendered React front end, a typed API layer and a relational database.
- Practical understanding of **transactional integrity** — why a balance check and a balance write must be one atomic operation.
- Understanding of **data modelling for money**: why currency must never be a float, and why historical records must freeze their own prices.
- Understanding of **security fundamentals**: salted slow hashing for admin credentials, constant-time comparison, parameterised queries, HTTP-only session cookies, and the danger of trusting client-supplied game state.
- A deployable artefact with **documented setup instructions** and an automated verification script.

### 5.4 Social and business outcome

For the target café, the intended measurable effects are: **reduced order errors**, **elimination of double-booked tables**, **a measurable repeat-visit rate** driven by the loyalty loop, and **an owner who can see their business on a phone** rather than in a notebook. For the wider student community, the project demonstrates that a complete, genuinely useful small-business digital tool can be built and deployed with free infrastructure and no proprietary software.

---

## 6. Alignment with Sustainable Development Goal (SDG)

### Primary alignment

> ### **SDG 9 — Industry, Innovation and Infrastructure**
> *Build resilient infrastructure, promote sustainable industrialisation and foster innovation.*

The project directly advances:

| Target | How this project contributes |
| --- | --- |
| **9.1** — Develop quality, reliable, sustainable and resilient infrastructure | Replaces fragile paper-based counter operations with a durable, cloud-hosted, backed-up digital record of every order and reservation. A café's sales history is no longer lost when a notebook is misplaced. |
| **9.4** — Upgrade infrastructure and industries to be sustainable | Enables café owners to run on paperless menus and QR-based ordering, removing the printing, reprinting and disposal of physical menus and reducing material waste per order. |
| **9.b** — Support domestic capacity-building in least developed countries | The system is delivered as **zero-licence, zero-hardware software** specifically so that small, resource-constrained enterprises can digitise rather than being priced out by commercial POS systems designed for chains. |
| **9.5** — Promote innovation | Converts the high-cost enterprise café-software model into a reproducible, deployable design that a small team can fork and extend for other micro-businesses. |

### Secondary alignment

| SDG | Target | Contribution |
| --- | --- | --- |
| **SDG 8 — Decent Work and Economic Growth** | 8.3 | Supports small and medium enterprises by giving independent cafés access to digital tooling usually limited to large chains. **8.5** inclusive growth: accessible from any phone, no hardware or training required. |
| **SDG 12 — Responsible Consumption and Production** | 12.3 | Order data enables demand analysis, reducing over-preparation and food waste. **12.4**: less paper. |
| **SDG 11 — Sustainable Cities and Communities** | 11.6 | Reduces the environmental footprint of urban food service through paperless operations and consolidated local ordering. |
| **SDG 13 — Climate Action** | 13.2 | Paperless menus and receipts measurably reduce material consumption per café. |

### Alignment statement (submission-ready)

> *CafeSuite contributes to **SDG 9 (Industry, Innovation and Infrastructure)**, specifically targets **9.1, 9.4 and 9.b**, by providing small food-service enterprises with resilient, innovative digital infrastructure at zero cost — thereby avoiding the exclusion of micro-businesses from the benefits of industrial digitalisation. Secondary contributions align with **SDG 8** (support for micro-enterprises and inclusive growth), **SDG 12** (responsible consumption through reduced food waste), and **SDG 13** (paperless operation).*

---

## 7. Outcome Achieved?

**Complete as a working prototype — every customer, operations, compliance and documentation phase is built and verified. The only step left is clicking “Deploy” on the public host.**

An honest, item-by-item status:

### ✅ Achieved and working

| Deliverable | Status |
| --- | --- |
| Full-stack application running end to end | **Complete** - 15 customer/admin pages and 28 API routes |
| Customer registration and login (member ID + password) | **Complete** — scrypt-hashed, app-managed |
| Responsive customer interface | **Complete** — menu, cart, checkout, booking, profile, 3 games |
| Table reservation with visual floor plan and time slots | **Complete** — with server-side validation |
| Cafe-time-zone booking calendar | **Complete** — configurable IANA zone, correct on UTC servers |
| Owner booking cancellation that frees the table | **Complete** — admin Bookings tab |
| Admin panel with menu CRUD and inline editing | **Complete** |
| Admin-editable store name, currency name, symbol and welcome bonus | **Complete** — runtime, no redeployment |
| Admin passcode authentication with change-passcode flow | **Complete** |
| Wallet top-up and coin redemption at checkout | **Complete** |
| Loyalty coin earning through three reward games with server-enforced limits | **Complete** |
| Member-visible coin ledger on the profile | **Complete** — every earn and spend with its reason and reference |
| Admin-set cap on how much of a bill coins may pay | **Complete** — default 50%, clamped in the cart and re-checked in the order transaction |
| Server-authoritative tic-tac-toe | **Complete** — the board lives in `game_sessions`; the browser only sends the square it plays |
| One live game session per member per game | **Complete** — enforced by a partial unique index |
| Admin members list with wallet and coin adjustment | **Complete** — searchable; coin changes carry a staff note into the ledger |
| Today's bookings at a glance | **Complete** — booking/guest counts, first and last arrival, cancellable list |
| Sales report for the owner | **Complete** — today's orders, gross, collected, average ticket, coins redeemed, best sellers and last 7 days |
| GST rate, GSTIN, FSSAI licence and invoice footer | **Complete** — GST-inclusive prices, tax share and licence details printed on the invoice |
| Privacy policy, DPDP consent and delete-my-data action | **Complete** — consent recorded at sign-up; password-confirmed deletion cascades through orders, bookings, coins and games |
| QR code per table | **Complete** — printable admin cards open `/menu?table=T3` with the table preselected |
| Installable PWA | **Complete** — manifest, icons, offline page and static-asset-only service worker |
| Order history and booking history on the member profile | **Complete** |
| Unified cloud database with a single version-controlled schema | **Complete** — 8 tables, one schema file, all validation and seeding automated |
| Exact-decimal money handling and atomic order transactions | **Complete** |
| Database-level guarantee against double-booked tables | **Complete** |
| Salted scrypt hashing for the admin credential | **Complete** |
| Admin login throttling — five wrong passcodes lock the panel for 15 minutes | **Complete** — persisted in the database, cleared on success |
| Live order board for the counter and live order-status page for the customer | **Complete** — status lifecycle, refunds and polling |
| Automated database and configuration health check (`npm run check:db`) | **Complete** |
| Complete setup and deployment documentation | **Complete** |

### ⚠️ Partially achieved / under verification

| Item | Status |
| --- | --- |
| Live end-to-end verification against the hosted Supabase project | **Complete** — schema deployed, type-check/build pass, sign-up/sign-in/order flows smoke-tested |
| Order status lifecycle (`pending → preparing → ready → completed / cancelled`) | **Complete** — owner order board and customer live-status page built and verified |
| Transaction-pooler-compatible deployment path | **Complete** (session pooler configured) — production deploy still to be executed |

### ❌ Deferred (out of scope for the rework)

1. **Coin expiry** — coins never expire today. A correct implementation needs an expiry date per ledger entry and a balance derived from it, which is more machinery than a counter-service café needs; the discount cap already removes the “free food” risk.
2. **Real payment gateway** — the wallet top-up remains a simulated UPI flow; replacing it is the one change required before the café handles live money.
3. **Member login throttling** — admin logins are already locked after five failures; member logins have no equivalent rate limit yet.

### Summary judgement

> The **core proposition** of the project — *an independent café can run its menu, orders, reservations and customer loyalty on a phone, at zero cost, without buying software* — is **achieved and demonstrable**. The system is a working, deployable full-stack application with a production-grade unified database layer, correct money handling, enforced data integrity, a real order-management loop and hardened authentication. The remaining work is **optional hardening and growth** (coin expiry, member-login throttling and swapping the simulated top-up for a real gateway) rather than a rebuild; the schema, data-access layer, authentication and transactional logic those features depend on are already in place and are not expected to change.

---

## Appendix A — Repository and artefact map

| Path | Contents |
| --- | --- |
| `supabase/schema.sql` | Single source of truth for the database schema |
| `supabase/reset.sql` | Wipe-all script for a clean re-deployment |
| `lib/db.ts` | Typed PostgreSQL data-access layer, transactions, seeding, scrypt hashing |
| `lib/auth.ts` | Member and administrator session management |
| `lib/time.ts` | Cafe time-zone helpers (so bookings stay correct on a UTC server) |
| `lib/tables.ts` | Floor plan and time-slot definitions |
| `lib/games.ts` | Shared reward-game logic and reward tables |
| `lib/menu.ts` | Seed menu catalogue |
| `app/api/**` | 28 API routes (auth, order, booking, top-up, games, members, reports, admin) |
| `app/admin/**` | Owner login and admin console |
| `components/**` | 21 reusable UI components |
| `app/privacy/**` | Privacy policy and DPDP consent details |
| `public/**` | PWA manifest, icons, offline page and service worker |
| `scripts/check-db.mjs` | Automated environment / database / auth health check |
| `scripts/db-setup.mjs` | One-command schema setup and reset (`npm run db:setup` / `db:reset`) |
| `scripts/seed-demo.mjs` | Demo members, orders and bookings for a viva (`npm run seed:demo`) |
| `scripts/lib/env.mjs` | Shared `.env.local` reader and connection pool for the scripts |
| `docs/REWORK-PLAN.md` | The 8-phase implementation plan and its completion status |
| `docs/PROJECT-REPORT.md` | This status report |
| `docs/PROJECT-DOC.md` | Short project summary and outcome |

## Appendix B — Environment variables required

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (Supabase **session pooler**, port 5432) |
| `SNAKE_CAFE_SECRET` | Secret used to sign session cookies — required in production |
| `SNAKE_CAFE_ADMIN_PASSCODE` | Administrator passcode |
| `NEXT_PUBLIC_SITE_URL` | Public site URL used in metadata and printed table QR links |

## Appendix C — Known limitation to disclose in the report

The wallet top-up currently uses a **simulated UPI flow**: the top-up endpoint credits the wallet without contacting a real payment gateway. This is clearly labelled as a demonstration flow in the interface and is safe for academic evaluation and controlled testing, but it **must be replaced with a real gateway (Razorpay/Cashfree) with server-side webhook verification before a café handles live money**. This is documented in the README, in `docs/REWORK-PLAN.md` and in the `.env.example` file, and is the only component of the system that is not production-ready for live payment.

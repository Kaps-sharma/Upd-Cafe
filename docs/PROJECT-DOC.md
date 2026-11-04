# Project Document

> Copy-paste friendly. Written to be short enough for a submission form.
> The product is described generically so it applies to any café, not just one.

---

## Project Type

Minor Project — Full-stack web application (deployed, database-backed)

## Title of the Project

**CafeSuite — A Cloud-Based Café Ordering, Loyalty and Table Reservation System**

*Alternative title:* SmartCafe — Online Ordering, Loyalty and Table Management for Cafés

---

## Problem Statement

Small cafés still run on paper menus, handwritten order registers and phone-based table
bookings. The result is slow service during peak hours, manual calculation errors at
billing, no visibility of order status for the kitchen, and no digital record of repeat
customers — making loyalty schemes and business reporting impossible. Existing digital
solutions are either too expensive or too complex for a small café to adopt.

---

## Methodology

- **Next.js 15 (App Router) + React 19 + TypeScript** for the front end and REST API layer
- **Supabase PostgreSQL** as the single cloud database; schema defined in version-controlled
  SQL and applied as constraints, not just application code
- **Member ID + password** login (salted scrypt hashes) with signed cookie sessions
- **Transaction-safe data layer** — every wallet deduction, coin redemption and table
  booking runs inside a database transaction with constraint-level conflict prevention
- **Normalised relational schema** (members, menu_items, orders, bookings, coin_transactions)
  with foreign keys, check constraints and a partial unique index to stop double-booking
- **Role-separated dashboard** for staff: menu management, live order status board,
  bookings and sales reports
- Deployed serverless with a **connection-pooled managed Postgres** instance for reliability

---

## Expected Outcome

- Customers can browse the menu, place orders, pay from a digital wallet, earn and redeem
  loyalty coins, and reserve a table online — with no paperwork
- Staff manage the menu, see every order's status in real time, and track daily sales
- All records persist in one secure cloud database, removing manual registers and
  cutting billing and table-conflict errors
- A deployable, low-cost system that a small café can actually run

---

## Alignment with Sustainable Development Goals

| SDG | Target | How this project contributes |
| --- | --- | --- |
| **9 — Industry, Innovation and Infrastructure** | 9.4: modernise small enterprises | Digitises café operations and builds affordable, scalable digital infrastructure for small businesses |
| **12 — Responsible Consumption and Production** | 12.3: halve food waste | Real-time order status reduces wrong or over-prepared food; digital menus remove printed-menu waste |
| **8 — Decent Work and Economic Growth** | 8.3: support small enterprises | Gives small cafés the digital tools larger chains take for granted, supporting growth and stable employment |

---

## Outcome Achieved?

**Yes — a fully working prototype has been developed and tested.**

- Complete authentication (member sign-up/login) and role-separated admin access
- Menu management, store/currency settings and a scrypt-hashed admin passcode
- Order placement with wallet payment, coin redemption and an itemised invoice
- Live order board for the kitchen and a live order-status page for the member
- Table reservation with automatic conflict prevention, cafe-time-zone dates and member booking history
- Staff cancellation of bookings that frees the table immediately
- Today's bookings at a glance for the counter staff
- Members list with wallet and coin adjustment, with a staff note on every coin change
- Sales reporting: orders, gross, collected, average ticket, coins redeemed, best sellers and the last seven days
- GST rate, GSTIN, FSSAI licence number and invoice footer on printed invoices
- Privacy policy with DPDP consent at sign-up and a password-confirmed delete-my-data action
- Printable QR code for every table, opening the menu with the table preselected
- Installable PWA with an offline page and a static-asset-only service worker
- Loyalty coin ledger recording every coin earned and spent
- Admin-set cap on how much of a bill coins may pay, with the full coin history visible to the member
- Server-authoritative games with one live session per member per game
- Unified, constraint-enforced cloud database with transaction-safe writes

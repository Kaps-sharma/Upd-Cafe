# Snake Cafe (Next.js)

A full React / Next.js conversion of the Python **Snake Cafe management system**,
with a configurable coin-based currency system and admin panel.

Members log in by name, receive a starting balance in coins (configurable),
order from the menu, earn extra coins by playing games, and view their order history.

## Stack

- **Next.js 15 (App Router)** + **React 19** + **TypeScript**
- **SQLite** via Node 24's built-in `node:sqlite` (no native compilation needed)
- Cookie-based sessions for members and admins (HMAC-signed)
- Menu, currency, and store settings stored in the database (admin-managed)

## Requirements

- Node.js 24 or later

## Getting started

```sh
npm install
npm run dev
```

Open http://localhost:3000 and sign in with any name.

Build / production:

```sh
npm run build
npm start
```

## Currency system

All balances and prices use a configurable coin currency, like Flipkart SuperCoins:

| Field             | Default       | Admin-editable |
| ----------------- | ------------- | -------------- |
| Store name        | Snake Cafe    | Yes            |
| Currency name     | Snake Coins   | Yes            |
| Currency symbol   | SC            | Yes            |
| Welcome bonus     | 50            | Yes            |

The admin can rename the store, change the currency to anything
("Cafe Points", "Venom Coins", "Byte Cash" ...), and adjust how many
coins a new member starts with — all live, no redeploy required.

## Admin panel

Navigate to **/admin** from the site. The default passcode is `admin123`.

You can:
- Change the store name, currency name, currency symbol, and welcome bonus
- Add, edit (inline), activate/deactivate, and delete menu items
- Change the admin passcode

## Project layout

```
app/                  API routes + pages
  api/
    admin/            Admin-only APIs (settings, menu CRUD, passcode)
    auth/             Login / register
    order/            Place orders (coin balance check)
    quiz/             Quiz game (server-graded)
    guess/            Guess the Number (secret in DB)
    tictactoe/        Tic Tac Toe win validation
    ...
  admin/              Admin login + panel pages
  menu/               Menu + order page
  quiz/               Quiz game page
  guess/              Guess the Number page
  tictactoe/          Tic Tac Toe page
  transactions/       Order history page
components/           Client-side UI components
lib/
  db.ts               SQLite database layer (node:sqlite)
  auth.ts             Member + admin session management (HMAC)
  menu.ts             Menu seed data + categories
  games.ts            Quiz, guess number, tic tac toe shared logic
  store.ts            Client-safe types + formatCoins helper
  events.ts           Balance change events
data/                 SQLite database file (auto-created, gitignored)
```

## Feature conversion from Python

| Python module     | Next.js equivalent                                    |
| ----------------- | ----------------------------------------------------- |
| `user.py`         | `app/login/page.tsx` + `app/api/auth/route.ts`        |
| `menu.py`         | `lib/menu.ts` + `app/api/admin/menu` (DB-driven)      |
| `order.py`        | `components/OrderMenu.tsx` + `app/api/order/route.ts`  |
| `quiz.py`         | `components/QuizGame.tsx` + `app/api/quiz/route.ts`    |
| `guess_number.py` | `components/GuessGame.tsx` + `app/api/guess/**`        |
| `tic_tac_toe.py`  | `components/TicTacToeGame.tsx` + `app/api/tictactoe/`  |
| `db_manager.py`   | `lib/db.ts` (SQLite, expanded schema)                  |

## Improved ordering system

- **Category filters**: browse Drinks, Snacks, Meals or all items
- **Live balance check**: see your coin balance while ordering
- **Confirm & pay modal**: review your order before final payment
- **Insufficient balance warning**: shown before you try to pay

## Notes

- The SQLite database (`data/snake_cafe.db`) is created automatically on first run.
- The admin passcode is stored as a salted SHA-256 hash. A fresh DB
  resets the passcode to the default.
- For production, set `SNAKE_CAFE_SECRET` and `SNAKE_CAFE_ADMIN_PASSCODE`
  environment variables.

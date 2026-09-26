# Stock Market Dashboard

A full-stack **paper-trading platform** for the Indian (NSE/BSE) and US
(NASDAQ/NYSE) equity markets. Trade with virtual money against real delayed
market data, track a portfolio with realistic brokerage and tax simulation, and
analyse your performance.

> **This is a simulation.** No real money, real orders or real brokerage
> accounts are involved anywhere. Nothing here is investment advice.

---

## Status — complete

| Milestone | Scope                                                                                                                                      | Status   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| **M0**    | Monorepo, strict TS, env validation, health/readiness, error + correlation-id middleware, shared contracts, CI, deploy config              | Complete |
| **M1**    | Auth: register, verify, login, refresh rotation with reuse detection, reset, RBAC, demo login, seeds                                       | Complete |
| **M2**    | App shell: sidebar, topbar, command-palette search, theming, route guards, all UI states                                                   | Complete |
| **M3**    | Market data: Yahoo → Finnhub → simulator chain, circuit breaker, Redis-or-memory cache, search, quotes, history, indices, movers, sessions | Complete |
| **M4**    | Trading engine: market + limit orders, fee/tax model, reservations, idempotency, matcher worker                                            | Complete |
| **M5**    | Portfolio & analytics: holdings, realised/unrealised P&L, allocation, snapshots, CSV + PDF export                                          | Complete |
| **M6**    | Watchlists, price alerts, alert evaluator, notifications, Socket.IO push                                                                   | Complete |
| **M7**    | Market news, stock comparison, education library, customisable widgets                                                                     | Complete |
| **M8**    | Admin and Super Admin consoles, audit log, runtime configuration                                                                           | Complete |
| **M9**    | Polish, accessibility, 327 automated tests, end-to-end verification, docs                                                                  | Complete |

**Verification:** 327 tests passing, 0 lint errors, 0 type errors, clean
production build, and a live end-to-end run against real Yahoo Finance data.
Full detail in **[TESTING.md](TESTING.md)**.

---

## Architecture

```
┌──────────────┐     same-origin /api      ┌──────────────────────────┐
│  Vercel      │ ────────────────────────▶ │  Render (Node/Express)   │
│  React SPA   │   (vercel.json rewrite)   │  REST + Socket.IO        │
└──────────────┘                           │  + background workers    │
                                           └──┬────────┬──────────┬───┘
                                              │        │          │
                                   ┌──────────▼┐  ┌────▼────┐  ┌──▼─────────────┐
                                   │ MongoDB   │  │ Redis   │  │ Yahoo Finance  │
                                   │ Atlas     │  │ Upstash │  │ + simulator    │
                                   └───────────┘  └─────────┘  └────────────────┘
```

Three decisions shape everything else:

1. **The API is same-origin.** Vite proxies `/api` in development and
   `vercel.json` rewrites it to Render in production. That is what lets the
   refresh token live in a `SameSite=Lax` httpOnly cookie rather than a
   third-party `SameSite=None` one that Safari and Brave drop.
2. **Wallets are segregated, with no FX.** An INR wallet trades NSE/BSE; a USD
   wallet trades NASDAQ/NYSE. No conversion happens in the ledger, so no
   exchange rate can corrupt a balance. Enforced by the engine, not the UI.
3. **Market data is never presented as real-time.** Every payload carries
   `{ source, asOf, isDelayed, isSimulated }` and the UI renders a badge from
   it. Free provider tiers are delayed, unofficial, or both — and the app says
   so on every price.

### Repository layout

```
.
├── shared/     @smd/shared — types, zod schemas and constants used by BOTH sides
├── server/     Express + Mongoose REST API, workers, Socket.IO
├── client/     React + Vite SPA
├── vercel.json Frontend build + the /api rewrite that keeps the API same-origin
├── render.yaml Backend blueprint
└── .github/    CI
```

`shared/` is the contract. A validation rule defined there cannot drift between
client and server, because both import the same object.

---

## Tech stack

| Layer      | Choice                                                   | Why                                                   |
| ---------- | -------------------------------------------------------- | ----------------------------------------------------- |
| Frontend   | React 19, Vite 8, TypeScript                             | SPA, fast HMR, strict typing                          |
| Styling    | Tailwind CSS v4, shadcn/ui conventions, Radix primitives | CSS-first tokens; accessible overlays you own         |
| Data       | TanStack Query                                           | Server-state cache and polling — the "live" feel      |
| State      | Zustand                                                  | Session, theme, widget layout                         |
| Charts     | Recharts                                                 | Price, portfolio, allocation, comparison, activity    |
| Backend    | Node 22, Express 5, TypeScript                           | Express 5 auto-forwards async errors                  |
| Database   | MongoDB Atlas, Mongoose 9                                | Multi-document transactions for trades                |
| Cache      | Redis (optional)                                         | Quote cache, rate limits — with in-process fallback   |
| Realtime   | Socket.IO                                                | Notifications, alert fires, order updates             |
| Auth       | argon2id, JWT + rotating refresh tokens                  | Memory-hard hashing, reuse detection                  |
| Validation | Zod 4                                                    | One schema validates the request and types the client |
| Tests      | Vitest, Supertest, mongodb-memory-server                 | Unit + integration on a real replica set              |

TypeScript is pinned to `~5.9`. TypeScript 7 compiles, but `typescript-eslint`
declares a peer range of `<6.1.0`, so adopting it would mean dropping
type-aware linting — including `no-floating-promises`, which is precisely the
rule that catches ledger-corrupting bugs.

---

## Local setup

**Prerequisites:** Node 22+ (see `.nvmrc`), npm 10+, and MongoDB — either a
local `mongod` or a free Atlas cluster.

```bash
# 1. Install everything (npm workspaces; run from the repo root)
npm install

# 2. Configure
cp server/.env.example server/.env
cp client/.env.example client/.env
#    Edit server/.env and set MONGODB_URI.

# 3. Build the shared contracts, then seed the database
npm run build:shared
npm run seed --workspace @smd/server

# 4. Run both apps
npm run dev
```

| URL                                 | What                                    |
| ----------------------------------- | --------------------------------------- |
| http://localhost:5173               | The app                                 |
| http://localhost:5173/api/v1/health | API through the dev proxy (same-origin) |
| http://localhost:5000/api/v1/health | API directly                            |

### Demo accounts

Seeded by `npm run seed`, pre-verified, and usable straight from the login
screen with one click — no password typing required.

| Role        | Email                       | Password     |
| ----------- | --------------------------- | ------------ |
| Trader      | `trader.demo@stockdashboard.com`     | `Tr@derDemo#82Lm!5` |
| Admin       | `admin.demo@stockdashboard.com`      | `Tr@derDemo#82Lm!5` |
| Super Admin | `superadmin.demo@stockdashboard.com` | `Tr@derDemo#82Lm!5` |

Demo accounts cannot change their own password or profile, so the shared demo
keeps working for everyone. Change `DEMO_PASSWORD` in `server/.env` and re-seed
to rotate them.

### Scripts

Run from the repo root:

| Script                                 | Does                                                   |
| -------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                          | Builds shared, then runs API and SPA together          |
| `npm run build`                        | Builds shared → server → client                        |
| `npm run typecheck`                    | Typechecks every workspace                             |
| `npm run lint`                         | ESLint with type-aware rules                           |
| `npm run test`                         | Runs the test suites                                   |
| `npm run format`                       | Prettier over the repo                                 |
| `npm run seed --workspace @smd/server` | Seeds roles, demo users, ~165 instruments, 12 articles |

---

## Trading rules

| Rule            | Value                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Opening capital | ₹10,00,000 (India) and $10,000 (US), fully separate                                                                   |
| Quantities      | Whole shares only. No shorting, margin or fractional trading                                                          |
| Market order    | Fills at the last cached price; rejected if that quote is over 15 minutes old                                         |
| Limit order     | BUY fills at or below the limit, SELL at or above; fills **at** the limit price                                       |
| Reservations    | Open BUY blocks cash; open SELL blocks shares                                                                         |
| Validity        | `DAY` (expires at close) or `GTC` (7 days)                                                                            |
| Closed market   | Rejected unless "queue for next open" is set                                                                          |
| India charges   | STT 0.1% both sides, stamp 0.015% on buy, exchange 0.00297%, SEBI ₹10/crore, GST 18% on (brokerage + exchange + SEBI) |
| US charges      | $0 commission; SEC fee and FINRA TAF on sales only                                                                    |
| Money           | Integer minor units (paise/cents) end-to-end — never floats                                                           |
| Duplicates      | `Idempotency-Key` header plus a unique index                                                                          |

**Formulas** (all in minor units):

```
averageCost    = SUM(buyQty x buyPrice + buyFees) / SUM(buyQty)
unrealisedPnl  = (lastPrice - averageCost) x quantity
realisedPnl    = (sellPrice x qty - sellFees) - (averageCost x qty)
totalValue     = cashAvailable + cashBlocked + SUM(marketValue)
```

Selling never changes `averageCost`; it only reduces quantity and books
realised P&L.

---

## API

Base path `/api/v1`. Every response uses one envelope.

```jsonc
// success
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 20, "total": 57 } }

// failure
{ "success": false, "error": { "code": "INSUFFICIENT_FUNDS", "message": "…", "requestId": "…" } }
```

`error.code` comes from `ERROR_CODES` in `@smd/shared` — clients switch on it
rather than parsing prose. `requestId` maps a user-visible failure to a server
log line.

| Group         | Endpoints                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health        | `GET /health`, `GET /ready`                                                                                                                                                  |
| Auth          | `register`, `login`, `demo-login`, `demo-accounts`, `verify-email`, `resend-verification`, `forgot-password`, `reset-password`, `refresh`, `logout`, `me`, `change-password` |
| Users         | `PATCH /users/profile`, `PATCH /users/preferences`                                                                                                                           |
| Market        | `search`, `status`, `status/:market`, `indices`, `movers`, `compare`, `news`, `POST /quotes`, `quote/:symbol`, `history/:symbol`, `/:symbol`                                 |
| Orders        | `POST /orders`, `POST /orders/preview`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`                                                                          |
| Portfolio     | `/portfolio`, `/holdings`, `/transactions`, `/analytics/summary`, `/analytics/allocation`, `/analytics/performance`, `/analytics/trades`, `/export`                          |
| Watchlists    | Full CRUD plus item add/remove                                                                                                                                               |
| Alerts        | Create, list, get, cancel, delete                                                                                                                                            |
| Notifications | List, unread-count, mark read, mark all read, delete                                                                                                                         |
| Education     | List, categories, detail, plus admin create/update/delete                                                                                                                    |
| Admin         | `users`, `users/:id/status`, `orders`, `analytics`, `instruments`                                                                                                            |
| Super Admin   | `admins`, `roles`, `roles/:role/permissions`, `config`, `system/health`, `system/database`, `audit-logs`                                                                     |

Socket.IO at `/api/v1/socket.io` (JWT handshake) emits `notification:new`,
`alert:triggered` and `order:updated`.

---

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full walkthrough — Atlas, Render,
Vercel, CORS, and the free-tier caveats.

## Testing

See **[TESTING.md](TESTING.md)** for the verification record, including the six
bugs found and fixed during the final pass and the known limitations.

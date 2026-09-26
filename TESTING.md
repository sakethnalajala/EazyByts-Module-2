# Testing checklist

A record of what has actually been verified. Items are ticked only after being
observed passing — never because the code "should" work.

```bash
npm run lint        # ESLint, type-aware
npm run typecheck   # tsc across all workspaces
npm run test        # Vitest
npm run build       # shared -> server -> client
```

---

## Summary — all milestones

| Gate                                 | Result                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| ESLint (type-aware, whole repo)      | **0 errors**, 2 warnings (both `react-refresh/only-export-components`, explained below) |
| TypeScript (`strict`, 3 workspaces)  | **0 errors**                                                                            |
| Automated tests                      | **327 passed / 327**, 11 files                                                          |
| Production build                     | **Clean**, shared → server → client                                                     |
| End-to-end run (API + SPA + MongoDB) | **Verified**, see below                                                                 |

The two remaining warnings are on `components/ui/index.tsx` and
`components/charts/index.tsx`, which export helper constants alongside
components. That only affects hot-reload granularity in development; it is not
a correctness issue.

---

## Automated test suites

| File                    | Tests | Covers                                                                  |
| ----------------------- | ----: | ----------------------------------------------------------------------- |
| `health.test.ts`        |     5 | Liveness, readiness, correlation-id propagation                         |
| `errorEnvelope.test.ts` |     6 | Error envelope, malformed JSON, helmet headers, CORS                    |
| `contracts.test.ts`     |    12 | Exchange→market→currency mapping, initial capital, pagination           |
| `fees.test.ts`          |    25 | India + US charge calculation, money primitives, formatting             |
| `auth.test.ts`          |    29 | Registration, verification, login, refresh rotation, reset, lockout     |
| `demoAndRbac.test.ts`   |    19 | Demo login (3 roles), permission bundles, preferences                   |
| `trading.test.ts`       |    36 | Market/limit orders, wallets, idempotency, ledger consistency           |
| `marketData.test.ts`    |    50 | Provider chain, simulator determinism, search, history, sessions, cache |
| `features.test.ts`      |    43 | Watchlists, alerts, evaluator, notifications, education                 |
| `admin.test.ts`         |    64 | RBAC matrix, user management, instruments, roles, config, audit         |
| `security.test.ts`      |    32 | Hashing, tokens, injection, headers, enumeration, escalation            |

Tests run against an in-memory MongoDB **replica set**
(`mongodb-memory-server`), not a standalone, so the multi-document transaction
path the trading engine depends on is genuinely exercised rather than skipped.

---

## Manual verification — live end-to-end run

Performed against the running stack: Vite dev server on `:5173`, Express API on
`:5000`, MongoDB, requests routed **through the `/api` proxy** so the
same-origin path is what was tested.

### Infrastructure

| #   | Check                                                               | Result |
| --- | ------------------------------------------------------------------- | ------ |
| 1   | `npm install` resolves all three workspaces cleanly                 | Pass   |
| 2   | Clean production build of shared, server and client                 | Pass   |
| 3   | API boots; workers, realtime gateway and cache all start            | Pass   |
| 4   | MongoDB connects; topology probed at startup                        | Pass   |
| 5   | Standalone `mongod` detected → warns and falls back, does not crash | Pass   |
| 6   | Redis absent → reports `disabled`, in-process cache used            | Pass   |
| 7   | SPA served, title renders                                           | Pass   |
| 8   | **API reachable through the Vite `/api` proxy (same-origin)**       | Pass   |
| 9   | `x-request-id` survives the proxy hop                               | Pass   |

### Authentication

| #   | Check                                                                                | Result |
| --- | ------------------------------------------------------------------------------------ | ------ |
| 10  | Register → `pending`, unverified, both wallets opened                                | Pass   |
| 11  | Password stored as argon2id, never plaintext                                         | Pass   |
| 12  | Email verification activates; link is single-use                                     | Pass   |
| 13  | Login issues access token + httpOnly refresh cookie                                  | Pass   |
| 14  | Refresh rotates the token                                                            | Pass   |
| 15  | Replaying a rotated token revokes the whole family                                   | Pass   |
| 16  | Logout revokes and clears                                                            | Pass   |
| 17  | Password reset works and kills every existing session                                | Pass   |
| 18  | Account locks after 10 failed attempts                                               | Pass   |
| 19  | **Demo login for all three roles** — trader (10 perms), admin (17), super admin (22) | Pass   |
| 20  | Demo accounts cannot change their own password or profile                            | Pass   |

### Market data

| #   | Check                                                                                 | Result |
| --- | ------------------------------------------------------------------------------------- | ------ |
| 21  | **Live Yahoo quote, NSE** — RELIANCE ₹1,250.20, `source: yahoo`, `isSimulated: false` | Pass   |
| 22  | **Live Yahoo quote, NASDAQ** — AAPL $339.75                                           | Pass   |
| 23  | Indices live — NIFTY 50, SENSEX, NIFTY Bank                                           | Pass   |
| 24  | Every payload carries `{source, asOf, isDelayed, isSimulated}`                        | Pass   |
| 25  | Nothing is ever reported as real-time (`isDelayed` always true)                       | Pass   |
| 26  | Mock fallback is deterministic and bounded around the reference price                 | Pass   |
| 27  | Simulated data is flagged and badged distinctly                                       | Pass   |
| 28  | Search by symbol and by company name, exact match ranked first                        | Pass   |
| 29  | Regex metacharacters in search treated as literals                                    | Pass   |
| 30  | Historical candles; longer range returns more bars; no weekend bars                   | Pass   |
| 31  | **Market hours resolved in the exchange timezone, not the host's**                    | Pass   |
| 32  | Indian holiday calendar honoured (Gandhi Jayanti → `holiday`)                         | Pass   |
| 33  | Batch quote endpoint collapses N symbols into one call, capped at 50                  | Pass   |

### Trading

| #   | Check                                                                           | Result |
| --- | ------------------------------------------------------------------------------- | ------ |
| 34  | **Market BUY fills at the live price** — 10 RELIANCE @ ₹1,249.80                | Pass   |
| 35  | Charges match the calculator exactly — ₹14.86 on a ₹12,498 trade                | Pass   |
| 36  | Wallet arithmetic exact — `1,000,000 − 12,512.86 = 987,487.14`                  | Pass   |
| 37  | Average cost capitalises buy fees (₹1,251.29 > ₹1,249.80)                       | Pass   |
| 38  | Market SELL credits proceeds net of charges                                     | Pass   |
| 39  | Realised P&L booked (−₹13.94: a same-price round trip loses the charges)        | Pass   |
| 40  | Limit order rests and reserves funds (₹500.62 blocked)                          | Pass   |
| 41  | Cancelling returns every paisa (blocked → ₹0.00)                                | Pass   |
| 42  | **Idempotency: replaying a key returns the original order** (`duplicate: true`) | Pass   |
| 43  | Insufficient funds → `INSUFFICIENT_FUNDS`                                       | Pass   |
| 44  | Overselling → `INSUFFICIENT_HOLDINGS`                                           | Pass   |
| 45  | Fractional quantity → `VALIDATION_ERROR`                                        | Pass   |
| 46  | Unknown symbol → `NOT_FOUND`                                                    | Pass   |
| 47  | Reserved shares cannot be double-sold                                           | Pass   |
| 48  | **INR wallet cannot fund a US trade and vice versa**                            | Pass   |
| 49  | Ledger replay reproduces the wallet balance exactly                             | Pass   |

### Portfolio & analytics

| #   | Check                                                                 | Result |
| --- | --------------------------------------------------------------------- | ------ |
| 50  | Both wallets reported separately (₹10,00,000 / $10,000)               | Pass   |
| 51  | Holdings with avg cost, market value, unrealised P&L                  | Pass   |
| 52  | Combined figure labelled indicative, with the rate disclosed          | Pass   |
| 53  | Trade statistics (count, closed, win rate, fees)                      | Pass   |
| 54  | Transaction ledger with full charge breakdown                         | Pass   |
| 55  | Sector allocation                                                     | Pass   |
| 56  | Performance series returned                                           | Pass   |
| 57  | **CSV export** — 200, `text/csv`, UTF-8 BOM, full fee columns         | Pass   |
| 58  | **PDF export** — 200, `application/pdf`, valid `%PDF-` header, 3.6 KB | Pass   |

### Features

| #   | Check                                                   | Result |
| --- | ------------------------------------------------------- | ------ |
| 59  | Watchlist hydrates with live prices across both markets | Pass   |
| 60  | Duplicate watchlist symbol → `CONFLICT`                 | Pass   |
| 61  | Price alert created and active                          | Pass   |
| 62  | Alert evaluator fires and creates a notification        | Pass   |
| 63  | Repeating alert re-arms with a cooldown                 | Pass   |
| 64  | **Order fills generate notifications automatically**    | Pass   |
| 65  | Notification read / read-all / unread count             | Pass   |
| 66  | Education: 12 articles seeded, markdown body served     | Pass   |
| 67  | Drafts hidden from readers, visible to editors          | Pass   |
| 68  | Stock comparison rebases to 100 for comparability       | Pass   |
| 69  | News falls back to a clearly-labelled simulated feed    | Pass   |

### Authorization

| #   | Check                                                                   | Result |
| --- | ----------------------------------------------------------------------- | ------ |
| 70  | **`/admin/*` — trader 403, admin 200, super admin 200, anon 401**       | Pass   |
| 71  | **`/super-admin/*` — trader 403, admin 403, super admin 200, anon 401** | Pass   |
| 72  | Admin console: users, analytics, trades, instruments                    | Pass   |
| 73  | Super admin: roles, config, system health, audit log                    | Pass   |
| 74  | Editing a role bundle invalidates live tokens for that role             | Pass   |
| 75  | Suspending a user ends their sessions immediately                       | Pass   |
| 76  | Last super admin cannot be demoted                                      | Pass   |
| 77  | Provider health visible (yahoo / finnhub / mock, all up)                | Pass   |

### Security

| #   | Check                                                         | Result |
| --- | ------------------------------------------------------------- | ------ |
| 78  | Mongo operator injection stripped from body, params and query | Pass   |
| 79  | Oversized body → 413, not 500                                 | Pass   |
| 80  | Helmet headers present; `x-powered-by` absent                 | Pass   |
| 81  | CORS never reflects an unknown origin, never uses `*`         | Pass   |
| 82  | Password hash never appears in any response                   | Pass   |
| 83  | No stack traces in error responses                            | Pass   |
| 84  | Login and forgot-password do not reveal which accounts exist  | Pass   |
| 85  | Role supplied in a request body is ignored                    | Pass   |
| 86  | Permissions derived from the database, never from the token   | Pass   |
| 87  | Deleted user's still-valid token is refused                   | Pass   |

---

## Bugs found and fixed during verification

Recorded because they are the useful part of a testing pass.

1. **Market-sell bypassed share reservations.** An immediate market SELL did not
   account for shares already reserved against a resting limit sell, so the same
   shares could be sold twice. Found by a trading test; fixed in
   `orders.service.ts` by checking `quantity − blockedQuantity`.
2. **Transactions crashed on a standalone MongoDB.** Order placement returned a
   500 in local development. The tests could not catch it because they run
   against a replica set. Fixed by probing server topology at connect time
   instead of pattern-matching error strings.
3. **Oversized request bodies returned 500.** The error handler only recognised
   `SyntaxError`, missing body-parser's `entity.too.large`. Now returns 413.
4. **IPv6 rate-limit key.** `express-rate-limit` v8 rejected a custom
   `keyGenerator` using raw `req.ip`, which would let an IPv6 host trivially
   evade the limit. Fixed with `ipKeyGenerator`.
5. **Duplicate `service` key in JSON logs.** Two fields of the same name.
6. **TypeScript 7 incompatibility.** Pinned to 5.9 — `typescript-eslint` has a
   peer range of `<6.1.0`, so TS 7 would have meant losing type-aware linting.

---

## Known limitations

Stated plainly rather than hidden.

- **Yahoo Finance is unofficial.** No SLA, no key, and it can change without
  notice. The chain degrades to the labelled simulator rather than failing.
- **Quotes are delayed**, typically ~15 minutes. Nothing in the app claims
  otherwise, and every price carries a provenance badge.
- **Render's free tier sleeps** after ~15 minutes idle. Scheduled workers pause
  while asleep; the matcher and alert evaluator also run opportunistically on
  incoming requests to compensate. The Starter plan removes this.
- **A local standalone `mongod` has no transactions.** Detected at boot, warned
  about, and worked around for development only. Atlas is always a replica set.
- **No browser-automation E2E tests.** Flows were driven through the HTTP API
  including the proxy path. Visual rendering and responsive layout were not
  machine-verified — open the app and check them in a browser.
- **Log redaction is configured but not asserted** by a test.
- **Holdings settle instantly.** Real markets are T+1; this simplification is
  deliberate and documented in the education content.

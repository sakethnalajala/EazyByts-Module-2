# Deployment

Frontend on **Vercel**, backend on **Render**, database on **MongoDB Atlas**.

Deploy order matters: Atlas → Render → Vercel. Render needs the database URI, and Vercel needs the
Render URL.

---

## 1. MongoDB Atlas

1. Create a free **M0** cluster.
2. **Database Access** → add a user with the `readWrite` role on `stock_market_dashboard`. Use a
   generated password and URL-encode any special characters when pasting it into the URI.
3. **Network Access** → add `0.0.0.0/0`.

   Render's free tier has no static outbound IP, so there is no narrower range to allowlist. The
   database user's credentials are the actual access control here. On a paid Render plan, swap this
   for the static IPs Render assigns.

4. **Connect → Drivers** → copy the `mongodb+srv://…` URI.

M0 clusters are replica sets, which is what makes the multi-document transactions the trading
engine needs (M4) available.

---

## 2. Render (API)

Either push `render.yaml` and use **New → Blueprint**, or create a Web Service manually with:

| Setting           | Value                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| Root directory    | _(repo root — not `server/`, so npm workspaces resolve)_                  |
| Build command     | `npm ci && npm run build:shared && npm run build --workspace @smd/server` |
| Start command     | `npm run start --workspace @smd/server`                                   |
| Health check path | `/api/v1/health`                                                          |

### Environment variables

| Key               | Value                                     |
| ----------------- | ----------------------------------------- |
| `NODE_ENV`        | `production`                              |
| `NODE_VERSION`    | `22`                                      |
| `LOG_LEVEL`       | `info`                                    |
| `TRUST_PROXY`     | `1`                                       |
| `MONGODB_URI`     | _(the Atlas URI)_                         |
| `MONGODB_DB_NAME` | `stock_market_dashboard`                  |
| `CORS_ORIGINS`    | _(the Vercel URL — fill in after step 3)_ |
| `REDIS_URL`       | _(optional; Upstash `rediss://…`)_        |

`TRUST_PROXY=1` matters: Render terminates TLS at its proxy, and without it every client IP reads
as the proxy's, which would make rate limiting key on a single address.

The health check is `/api/v1/health` (liveness) rather than `/api/v1/ready`. Readiness returns 503
while Atlas is momentarily unreachable, which would fail an otherwise healthy deploy.

### Free-tier caveats

- **The service sleeps after ~15 minutes idle.** The next request pays a cold start of roughly 50
  seconds. The client's fetch wrapper uses a 15s timeout and surfaces a "the server may be waking
  up" message rather than a generic failure.
- **No cron runs while asleep.** This will stall the limit-order matcher (M4) and the alert
  evaluator (M6). Mitigations: match opportunistically on incoming API requests, and ping the
  service externally every 10 minutes. The Starter plan removes the problem entirely and is worth
  it before any live demo.

---

## 3. Vercel (SPA)

Import the repository. `vercel.json` at the repo root already sets the build:

```jsonc
{
  "buildCommand": "npm run build:shared && npm run build --workspace @smd/client",
  "outputDirectory": "client/dist",
}
```

**Before the first deploy, edit `vercel.json`** and replace the rewrite placeholder with the real
Render hostname:

```jsonc
{
  "source": "/api/:path*",
  "destination": "https://REPLACE-WITH-YOUR-RENDER-SERVICE.onrender.com/api/:path*",
}
```

This rewrite is load-bearing, not a convenience. It makes the API same-origin with the SPA, which
is what allows the refresh token to be a `SameSite=Lax` httpOnly cookie. Calling Render directly
from the browser would make that cookie third-party, and Safari and Brave block those by default —
users on those browsers would be silently logged out whenever their access token expired.

Keep the rewrites in order: `/api/:path*` must come **before** the `/(.*)` SPA fallback, or every
API call returns `index.html`.

### Environment variables

| Key                 | Value                    |
| ------------------- | ------------------------ |
| `VITE_API_BASE_URL` | `/api/v1`                |
| `VITE_APP_NAME`     | `Stock Market Dashboard` |

Only `VITE_`-prefixed values reach the browser, and everything here is public by definition. Market
data provider keys stay on Render.

---

## 4. Close the loop

Set `CORS_ORIGINS` on Render to the Vercel origins, comma-separated, then redeploy:

```
https://your-app.vercel.app,https://your-app-git-main-you.vercel.app
```

Include preview domains if you intend to use them. No wildcard is accepted: credentialed CORS
requests require an exact origin.

---

## 5. Verify

```bash
# Render directly
curl -i https://YOUR-API.onrender.com/api/v1/health
curl -s https://YOUR-API.onrender.com/api/v1/ready

# Through the Vercel proxy — this is the one that proves the deployment
curl -s https://YOUR-APP.vercel.app/api/v1/health
```

Passing looks like:

- `/api/v1/health` → `200`, `{"success":true,"data":{"status":"ok",…}}`
- `/api/v1/ready` → `200` with `dependencies.mongo.state: "up"`
- The proxied call returns the same JSON as the direct one, **and an `x-request-id` response
  header**. Getting HTML back instead means the rewrite order is wrong.

---

## Troubleshooting

| Symptom                                  | Cause                                 | Fix                                                     |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------------------- |
| Proxied `/api/*` returns HTML            | SPA fallback is matching first        | Put the `/api/:path*` rewrite before `/(.*)`            |
| `/ready` reports `mongo: down`           | Atlas IP allowlist, or a bad password | Add `0.0.0.0/0`; URL-encode the password                |
| Process exits immediately on boot        | Env validation rejected a variable    | Read the startup log — it names each offending variable |
| CORS error in the browser console        | Origin missing from `CORS_ORIGINS`    | Add the exact origin, including scheme, then redeploy   |
| First request after idle times out       | Free-tier cold start                  | Expected; retry, or move to Starter                     |
| Build fails with `@smd/shared` not found | Shared built after its consumers      | Build command must run `npm run build:shared` first     |

---

## Environment variables (complete)

### Render (API)

| Key                                                       | Required | Value                                                   |
| --------------------------------------------------------- | -------- | ------------------------------------------------------- |
| `NODE_ENV`                                                | yes      | `production`                                            |
| `NODE_VERSION`                                            | yes      | `22`                                                    |
| `LOG_LEVEL`                                               | no       | `info`                                                  |
| `TRUST_PROXY`                                             | yes      | `1`                                                     |
| `MONGODB_URI`                                             | **yes**  | The Atlas `mongodb+srv://` URI                          |
| `MONGODB_DB_NAME`                                         | no       | `stock_market_dashboard`                                |
| `JWT_ACCESS_SECRET`                                       | **yes**  | `openssl rand -base64 48`                               |
| `JWT_REFRESH_SECRET`                                      | **yes**  | A DIFFERENT `openssl rand -base64 48`                   |
| `CORS_ORIGINS`                                            | **yes**  | Your Vercel origins, comma-separated                    |
| `APP_URL`                                                 | **yes**  | Your Vercel URL, used to build email links              |
| `COOKIE_SAMESITE`                                         | no       | `lax` (correct with the proxy)                          |
| `DEMO_PASSWORD`                                           | no       | Defaults to `Demo@12345`                                |
| `REDIS_URL`                                               | no       | Upstash `rediss://…`; omit to use the in-process cache  |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | no       | Omit and links are returned in the API response instead |
| `MAIL_FROM`                                               | no       | Sender identity                                         |
| `FINNHUB_API_KEY`                                         | no       | Enables the US fallback provider                        |
| `ALPHAVANTAGE_API_KEY`                                    | no       | Enables the history fallback                            |
| `MARKET_DATA_FORCE_MOCK`                                  | no       | `true` forces the simulator                             |
| `QUOTE_CACHE_TTL_SECONDS`                                 | no       | `30`                                                    |
| `ENABLE_WORKERS`                                          | no       | `true`                                                  |

The server **refuses to start in production** if `JWT_ACCESS_SECRET` or
`JWT_REFRESH_SECRET` is left at its development default, or if the two match.

### Vercel (SPA)

| Key                 | Value                    |
| ------------------- | ------------------------ |
| `VITE_API_BASE_URL` | `/api/v1`                |
| `VITE_APP_NAME`     | `Stock Market Dashboard` |

Only `VITE_`-prefixed values reach the browser, and everything there is public
by definition. Provider keys stay on Render.

---

## Seeding production

The app needs its roles, demo accounts and instrument universe before it is
usable. After the first successful Render deploy, run once from the Render
shell:

```bash
npm run seed --workspace @smd/server
```

The seed is idempotent — re-running it tops up rather than destroying data, and
it resets the demo-account passwords to the current `DEMO_PASSWORD`.

---

## Post-deploy verification checklist

```bash
# 1. API liveness (direct)
curl -i https://YOUR-API.onrender.com/api/v1/health

# 2. Readiness - mongo must be "up"
curl -s https://YOUR-API.onrender.com/api/v1/ready

# 3. THROUGH the Vercel proxy: this is the one that proves the deployment
curl -s https://YOUR-APP.vercel.app/api/v1/health

# 4. Demo login works end to end
curl -s -X POST https://YOUR-APP.vercel.app/api/v1/auth/demo-login   -H 'Content-Type: application/json' -d '{"role":"trader"}'

# 5. Live market data
curl -s https://YOUR-APP.vercel.app/api/v1/market/quote/RELIANCE?exchange=NSE
```

Passing looks like:

- `/health` → `200`, `{"success":true,...}`
- `/ready` → `200` with `dependencies.mongo.state: "up"`
- The proxied call returns the same JSON as the direct one **and an
  `x-request-id` response header**. Getting HTML back means the rewrite order is
  wrong.
- Demo login returns an `accessToken` and sets an `smd_rt` cookie.
- The quote carries `sourceMeta` with `isDelayed: true`.

Then open the app, sign in with a demo account, and confirm the dashboard
renders with live prices and a data-source badge.

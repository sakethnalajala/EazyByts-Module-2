import { z } from 'zod';

/**
 * Environment contract.
 *
 * Parsed once, at module load, before anything else boots. A missing or
 * malformed variable kills the process with a readable report rather than
 * surfacing as a confusing runtime failure ten minutes into a demo.
 */

const csv = (value: string): string[] =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * Secrets must be long enough to be worth having. In development a default is
 * generated so `npm run dev` works out of the box; in production a real value
 * is mandatory, enforced by the superRefine below.
 */
const DEV_ACCESS_SECRET = 'dev-only-access-secret-not-for-production-use-0123456789';
const DEV_REFRESH_SECRET = 'dev-only-refresh-secret-not-for-production-use-0123456789';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    /** Render injects PORT and expects the process to bind to it. */
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    HOST: z.string().min(1).default('0.0.0.0'),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    MONGODB_URI: z
      .string()
      .min(1, 'MONGODB_URI is required')
      .refine(
        (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
        'MONGODB_URI must start with mongodb:// or mongodb+srv://',
      ),
    MONGODB_DB_NAME: z.string().min(1).default('stock_market_dashboard'),

    /**
     * Optional by design. Redis backs the quote cache, the refresh-token
     * denylist and distributed rate limits, but every one of those has an
     * in-process fallback so the app still runs when Redis is absent.
     */
    REDIS_URL: z.string().min(1).optional(),

    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform(csv)
      .pipe(z.array(z.string().min(1)).min(1)),

    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

    // ---------------------------------------------------------------- auth
    JWT_ACCESS_SECRET: z.string().min(32).default(DEV_ACCESS_SECRET),
    JWT_REFRESH_SECRET: z.string().min(32).default(DEV_REFRESH_SECRET),
    /** Short-lived on purpose; the refresh token does the heavy lifting. */
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    /** Name of the httpOnly cookie carrying the refresh token. */
    REFRESH_COOKIE_NAME: z.string().min(1).default('smd_rt'),
    /**
     * Set only when the API is served from a different site than the SPA. The
     * Vercel proxy makes them same-origin, which is why Lax is the default and
     * the third-party-cookie problem never arises.
     */
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z.string().min(1).optional(),

    /** Public URL of the SPA, used to build verification and reset links. */
    APP_URL: z.string().min(1).default('http://localhost:5173'),

    // --------------------------------------------------------------- email
    /** Without SMTP settings the mailer logs the message instead of sending. */
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    MAIL_FROM: z.string().min(1).default('Stock Market Dashboard <no-reply@smd.local>'),

    // -------------------------------------------------------- market data
    /**
     * Yahoo is the primary provider and needs no key. These optional keys
     * enable the secondary and tertiary tiers of the provider chain.
     */
    FINNHUB_API_KEY: z.string().min(1).optional(),
    ALPHAVANTAGE_API_KEY: z.string().min(1).optional(),
    /** Forces the deterministic simulator, for offline development. */
    MARKET_DATA_FORCE_MOCK: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    QUOTE_CACHE_TTL_SECONDS: z.coerce.number().int().min(5).max(3600).default(30),

    // ------------------------------------------------------------ workers
    /** Disable background workers (matcher, alerts, snapshots) in tests. */
    ENABLE_WORKERS: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    ORDER_MATCHER_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(3600).default(30),
    ALERT_EVALUATOR_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),

    /**
     * OPTIONAL global override for every demo account password.
     *
     * Unset - the normal case - each demo account uses its own password from
     * DEMO_ACCOUNTS. Set it to lock a public deploy behind one rotated value.
     */
    DEMO_PASSWORD: z.string().min(8).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    // Shipping the development fallbacks to production would mean anyone
    // reading this repository could mint valid tokens.
    if (value.JWT_ACCESS_SECRET === DEV_ACCESS_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'JWT_ACCESS_SECRET must be set to a real secret in production.',
      });
    }
    if (value.JWT_REFRESH_SECRET === DEV_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must be set to a real secret in production.',
      });
    }
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET.',
      });
    }
    // SameSite=None without Secure is rejected by browsers outright.
    if (value.COOKIE_SAMESITE === 'none' && !value.APP_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SAMESITE'],
        message: 'COOKIE_SAMESITE=none requires an https APP_URL.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const report = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    // Deliberately console, not the logger: the logger depends on this module.
    console.error(`\nInvalid environment configuration:\n${report}\n`);
    console.error('Copy server/.env.example to server/.env and fill in the blanks.\n');
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';

/** True when real SMTP credentials exist; otherwise mail is logged, not sent. */
export const hasSmtp = Boolean(env.SMTP_HOST && env.SMTP_PORT);

import { z } from 'zod';

/**
 * Browser-side configuration.
 *
 * Validated at module load for the same reason the server validates its own:
 * a misconfigured deploy should fail loudly and immediately, not as a confusing
 * network error three screens into the app.
 *
 * Only VITE_-prefixed values exist here, and every one of them is public by
 * definition. No secret may ever be added to this file.
 */
const clientEnvSchema = z.object({
  /**
   * Relative by default. Vite proxies it in dev and vercel.json rewrites it in
   * production, so the browser always talks to its own origin.
   */
  VITE_API_BASE_URL: z.string().min(1).default('/api/v1'),
  VITE_APP_NAME: z.string().min(1).default('Stock Market Dashboard'),
});

const parsed = clientEnvSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const report = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid client environment configuration:\n${report}`);
}

export const clientEnv = parsed.data;

export const IS_DEV = import.meta.env.DEV;

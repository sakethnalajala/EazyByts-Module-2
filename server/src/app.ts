import express, { type Express } from 'express';
import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env, isProduction } from './config/env.js';
import { logger } from './config/logger.js';
import { httpLogger } from './middleware/httpLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { sanitizeRequest } from './middleware/sanitize.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { apiRouter } from './routes/index.js';
import { API_PREFIX } from './constants/app.js';

/**
 * Builds the Express application.
 *
 * Exported separately from the HTTP server so integration tests can drive it
 * with supertest without binding a port.
 */
export function createApp(): Express {
  const app = express();

  // Render terminates TLS upstream; without this, client IPs (and therefore
  // rate limiting) would all collapse to the proxy's address.
  if (env.TRUST_PROXY > 0) {
    app.set('trust proxy', env.TRUST_PROXY);
  }
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; the SPA is hosted separately on Vercel and
      // carries its own CSP, so a restrictive policy here is free.
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      // The SPA is served from a different registrable domain in the direct-call
      // fallback path. CORP governs no-cors embedding and adds nothing on top of
      // the CORS allowlist for a JSON API, so it is relaxed on purpose.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  const corsOptions: CorsOptions = {
    origin(origin, callback) {
      // No Origin header: curl, Postman, server-to-server. Browsers always send
      // one, so this cannot be used to bypass the allowlist from a page.
      if (!origin) return callback(null, true);
      if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);
      logger.warn({ origin }, 'Blocked by CORS allowlist');
      return callback(null, false);
    },
    // Required for the httpOnly refresh cookie.
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  };
  app.use(cors(corsOptions));

  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser());
  // Runs after the body parsers so it can scrub what they produced.
  app.use(sanitizeRequest);
  app.use(httpLogger);
  app.use(globalLimiter);

  app.use(API_PREFIX, apiRouter);

  // Bare-root convenience response, mostly so a cold Render URL is not a 404.
  app.get('/', (_req, res) => {
    res.json({
      success: true,
      data: { message: 'Stock Market Dashboard API', api: API_PREFIX },
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  if (!isProduction) {
    logger.debug({ corsOrigins: env.CORS_ORIGINS }, 'CORS allowlist loaded');
  }

  return app;
}

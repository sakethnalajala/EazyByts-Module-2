import { createServer, type Server } from 'node:http';
import { createApp } from './app.js';
import { env, isProduction } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { closeCache, initCache } from './services/cache/cache.js';
import { closeRealtime, initRealtime } from './services/realtime/gateway.js';
import { startOrderMatcher, stopOrderMatcher } from './workers/orderMatcher.js';
import { startAlertEvaluator, stopAlertEvaluator } from './workers/alertEvaluator.js';
import { startSnapshotJob, stopSnapshotJob } from './workers/snapshotJob.js';
import { API_PREFIX, SERVICE_VERSION } from './constants/app.js';

/** Grace period for in-flight requests before the process is forced down. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

function bootstrap(): void {
  const app = createApp();

  // An explicit http.Server, because Socket.IO needs to attach to it.
  const httpServer: Server = createServer(app);

  initCache();
  initRealtime(httpServer);

  // Not awaited: the server must accept traffic (and answer /health) even while
  // Atlas is still connecting or retrying. /ready reports the real state.
  void connectDatabase();

  startOrderMatcher();
  startAlertEvaluator();
  startSnapshotJob();

  httpServer.listen(env.PORT, env.HOST, () => {
    logger.info(
      {
        version: SERVICE_VERSION,
        env: env.NODE_ENV,
        url: `http://${env.HOST}:${env.PORT}${API_PREFIX}`,
        workers: env.ENABLE_WORKERS,
      },
      'API listening',
    );
  });

  // Render's load balancer tolerates slow clients poorly; these mirror its
  // recommended keep-alive settings to avoid spurious 502s.
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    stopOrderMatcher();
    stopAlertEvaluator();
    stopSnapshotJob();

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    httpServer.close(() => {
      void Promise.allSettled([closeRealtime(), disconnectDatabase(), closeCache()])
        .catch((error: unknown) => logger.error({ err: error }, 'Error during shutdown'))
        .finally(() => {
          clearTimeout(forceExit);
          process.exit(0);
        });
    });
  };

  // Render sends SIGTERM on deploy and on free-tier spin-down.
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
    if (isProduction) shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error: Error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
}

bootstrap();

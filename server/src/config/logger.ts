import { pino } from 'pino';
import { env, isDevelopment, isTest } from './env.js';
import { SERVICE_NAME } from '../constants/app.js';

/**
 * Structured logging. Human-readable in development, newline-delimited JSON in
 * production so Render's log drain stays parseable.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: SERVICE_NAME },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service' },
        },
      }
    : {}),
});

export type Logger = typeof logger;

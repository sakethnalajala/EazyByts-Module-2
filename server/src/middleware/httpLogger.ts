import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import type { Request, Response } from 'express';
import { logger } from '../config/logger.js';

/** Header used to propagate a correlation id in from a proxy and back out. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Request logging plus correlation ids.
 *
 * An inbound X-Request-Id is honoured so a trace survives the Vercel proxy hop;
 * otherwise one is minted. The id is echoed on the response and embedded in
 * error bodies, which is what makes a user-reported failure findable in logs.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
    res.setHeader(REQUEST_ID_HEADER, id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Health probes fire constantly on Render and would drown the log.
  autoLogging: {
    ignore: (req) => req.url === '/api/v1/health' || req.url === '/api/v1/ready',
  },
  serializers: {
    req: (req: Request) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res: Response) => ({ statusCode: res.statusCode }),
  },
});

export function getRequestId(req: Request): string | undefined {
  const id: unknown = req.id;
  return typeof id === 'string' ? id : undefined;
}

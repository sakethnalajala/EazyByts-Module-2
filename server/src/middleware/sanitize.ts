import type { NextFunction, Request, Response } from 'express';

/**
 * Strips Mongo operator injection from request input.
 *
 * `express-mongo-sanitize` is not used because Express 5 exposes `req.query` as
 * a getter, which that package tries to reassign. This walks the parsed objects
 * in place instead, deleting any key that begins with `$` or contains a dot -
 * the two shapes that turn a value into a query operator or a path traversal.
 *
 * Mongoose's schema casting already blocks most of this; treat it as the second
 * layer, not the only one.
 */

const MAX_DEPTH = 8;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scrub(value: unknown, depth = 0): void {
  if (depth > MAX_DEPTH) return;

  if (Array.isArray(value)) {
    for (const entry of value) scrub(entry, depth + 1);
    return;
  }

  if (!isPlainObject(value)) return;

  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete value[key];
      continue;
    }
    scrub(value[key], depth + 1);
  }
}

export function sanitizeRequest(req: Request, _res: Response, next: NextFunction): void {
  scrub(req.body);
  scrub(req.params);
  // req.query is a getter in Express 5, so mutate its contents rather than
  // replacing the object.
  scrub(req.query);
  next();
}

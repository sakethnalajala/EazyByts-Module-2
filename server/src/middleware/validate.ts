import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../utils/ApiError.js';

/**
 * Zod request validation.
 *
 * The parsed result REPLACES the raw input on a dedicated `req.valid` object
 * rather than mutating `req.body`/`req.query` - Express 5 makes `req.query` a
 * getter, so assigning to it throws. Downstream handlers read `req.valid.*`,
 * which is also typed, unlike the raw Express properties.
 */

export interface ValidatedRequest<TBody = unknown, TQuery = unknown, TParams = unknown> {
  body: TBody;
  query: TQuery;
  params: TParams;
}

declare module 'express-serve-static-core' {
  interface Request {
    valid: ValidatedRequest;
  }
}

function ensureValid(req: Request): void {
  req.valid ??= { body: undefined, query: undefined, params: undefined };
}

function toFieldErrors(error: unknown): { path: string; message: string }[] {
  const issues = (error as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  if (!issues) return [];
  return issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(ApiError.validation('Request body is invalid.', toFieldErrors(result.error)));
      return;
    }
    ensureValid(req);
    req.valid.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(ApiError.validation('Query parameters are invalid.', toFieldErrors(result.error)));
      return;
    }
    ensureValid(req);
    req.valid.query = result.data;
    next();
  };
}

export function validateParams<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(ApiError.validation('Route parameters are invalid.', toFieldErrors(result.error)));
      return;
    }
    ensureValid(req);
    req.valid.params = result.data;
    next();
  };
}

/** Typed accessors, so handlers do not litter casts everywhere. */
export function body<T>(req: Request): T {
  return req.valid.body as T;
}
export function query<T>(req: Request): T {
  return req.valid.query as T;
}
export function params<T>(req: Request): T {
  return req.valid.params as T;
}

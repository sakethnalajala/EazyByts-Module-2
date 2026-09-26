import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { ERROR_CODES, type ApiFailure, type ApiFieldError } from '@smd/shared';
import { ApiError } from '../utils/ApiError.js';
import { isProduction } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getRequestId } from './httpLogger.js';

interface MongoDuplicateKeyError extends Error {
  code: number;
  keyValue?: Record<string, unknown>;
}

function isDuplicateKeyError(error: unknown): error is MongoDuplicateKeyError {
  return error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 11000;
}

/**
 * body-parser failures.
 *
 * These are NOT all SyntaxErrors: an oversized payload raises a
 * PayloadTooLargeError carrying `type: 'entity.too.large'`. Matching only on
 * SyntaxError let that fall through to a 500, which is both wrong and
 * unhelpful to the caller.
 */
interface BodyParserError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
}

function asBodyParserError(error: unknown): BodyParserError | null {
  if (!(error instanceof Error)) return null;
  const candidate = error as BodyParserError;

  if (typeof candidate.type === 'string' && candidate.type.startsWith('entity.')) {
    return candidate;
  }
  if (error instanceof SyntaxError && 'body' in error) return candidate;
  return null;
}

function zodToFieldErrors(error: ZodError): ApiFieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/** Translates any thrown value into the canonical failure envelope. */
function normalise(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.validation('Request validation failed.', zodToFieldErrors(error));
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const details = Object.values(error.errors).map((issue) => ({
      path: issue.path,
      message: issue.message,
    }));
    return ApiError.validation('Document validation failed.', details);
  }

  if (error instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for '${error.path}'.`, [
      { path: error.path, message: `Expected a valid ${error.kind}.` },
    ]);
  }

  if (isDuplicateKeyError(error)) {
    const field = Object.keys(error.keyValue ?? {})[0] ?? 'field';
    return ApiError.conflict(ERROR_CODES.CONFLICT, `A record with that ${field} already exists.`);
  }

  const bodyError = asBodyParserError(error);
  if (bodyError) {
    if (bodyError.type === 'entity.too.large') {
      return new ApiError(
        413,
        ERROR_CODES.BAD_REQUEST,
        'Request body is too large. The limit is 100kb.',
      );
    }
    return ApiError.badRequest('Request body is not valid JSON.');
  }

  return ApiError.internal('Something went wrong on our end.', error);
}

/**
 * Terminal error middleware. Express 5 forwards rejected async handlers here
 * automatically, so route code can throw freely.
 *
 * Express identifies this as an error handler by its arity, so `_next` must
 * stay in the signature even though it is unused.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const apiError = normalise(error);
  const requestId = getRequestId(req);

  if (!apiError.isOperational || apiError.statusCode >= 500) {
    logger.error(
      { err: error, requestId, method: req.method, url: req.originalUrl },
      'Unhandled request failure',
    );
  } else {
    logger.warn(
      { code: apiError.code, requestId, method: req.method, url: req.originalUrl },
      apiError.message,
    );
  }

  // Never leak internals in production; a request id is enough to find the log.
  const message =
    isProduction && !apiError.isOperational ? 'Something went wrong on our end.' : apiError.message;

  const body: ApiFailure = {
    success: false,
    error: {
      code: apiError.code,
      message,
      ...(apiError.details ? { details: apiError.details } : {}),
      ...(requestId ? { requestId } : {}),
    },
  };

  if (res.headersSent) return;
  res.status(apiError.statusCode).json(body);
}

import { ERROR_CODES, type ApiFieldError, type ErrorCode } from '@smd/shared';

/**
 * The only error type controllers and services should throw.
 *
 * Carrying the HTTP status and the machine-readable code together means the
 * error handler never has to guess, and the client can switch on `code` without
 * parsing prose.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details: ApiFieldError[] | undefined;
  /** Expected errors are not logged as server faults. */
  readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options: { details?: ApiFieldError[]; cause?: unknown; isOperational?: boolean } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Malformed request.', details?: ApiFieldError[]): ApiError {
    return new ApiError(400, ERROR_CODES.BAD_REQUEST, message, { details });
  }

  static unauthenticated(message = 'Authentication required.'): ApiError {
    return new ApiError(401, ERROR_CODES.UNAUTHENTICATED, message);
  }

  static forbidden(message = 'You do not have permission to perform this action.'): ApiError {
    return new ApiError(403, ERROR_CODES.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found.'): ApiError {
    return new ApiError(404, ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(code: ErrorCode, message: string): ApiError {
    return new ApiError(409, code, message);
  }

  static validation(message = 'Validation failed.', details?: ApiFieldError[]): ApiError {
    return new ApiError(422, ERROR_CODES.VALIDATION_ERROR, message, { details });
  }

  static rateLimited(message = 'Too many requests. Please slow down.'): ApiError {
    return new ApiError(429, ERROR_CODES.RATE_LIMITED, message);
  }

  static upstreamUnavailable(message = 'An upstream data provider is unavailable.'): ApiError {
    return new ApiError(503, ERROR_CODES.UPSTREAM_UNAVAILABLE, message);
  }

  static internal(message = 'Something went wrong on our end.', cause?: unknown): ApiError {
    return new ApiError(500, ERROR_CODES.INTERNAL_ERROR, message, {
      cause,
      isOperational: false,
    });
  }
}

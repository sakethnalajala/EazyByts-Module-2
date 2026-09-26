import type { ErrorCode } from '../constants/errorCodes.js';

/** Field-level detail attached to a VALIDATION_ERROR. */
export interface ApiFieldError {
  /** Dot/bracket path into the request payload, e.g. `body.quantity`. */
  path: string;
  message: string;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: ApiFieldError[];
  /** Correlates a client-side report with a server log line. */
  requestId?: string;
}

/**
 * Declared as a type alias rather than an interface on purpose: only aliases
 * receive an implicit index signature, which `ResponseMeta` below relies on to
 * merge pagination with arbitrary endpoint-specific metadata.
 */
export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/** Pagination fields plus whatever extra context an endpoint wants to attach. */
export type ResponseMeta = PaginationMeta & Record<string, unknown>;

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

/**
 * Every endpoint returns exactly this shape. Narrow on `success` to discriminate.
 */
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function isApiSuccess<T>(res: ApiResponse<T>): res is ApiSuccess<T> {
  return res.success;
}

import type { Response } from 'express';
import type { ApiSuccess, PaginationMeta } from '@smd/shared';

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1 && totalPages > 0,
  };
}

/** Wraps a payload in the standard success envelope. */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: ApiSuccess<T>['meta'],
): Response {
  const body: ApiSuccess<T> = meta ? { success: true, data, meta } : { success: true, data };
  return res.status(statusCode).json(body);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: { page: number; limit: number; total: number },
  statusCode = 200,
): Response {
  return sendSuccess(
    res,
    data,
    statusCode,
    buildPaginationMeta(pagination.page, pagination.limit, pagination.total),
  );
}

import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';

/** Terminal middleware: converts an unmatched route into the error envelope. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist.`));
}

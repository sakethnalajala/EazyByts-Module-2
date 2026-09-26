import type { NextFunction, Request, Response } from 'express';
import { ERROR_CODES, type Permission, type Role } from '@smd/shared';
import { ApiError } from '../utils/ApiError.js';

/**
 * Authorization.
 *
 * Routes declare the PERMISSION they need, not a role. That indirection is what
 * lets a Super Admin re-bundle permissions at runtime, and it keeps the check
 * honest: nothing here reads a role name out of the request body, so a client
 * cannot claim to be an admin.
 */

export function requirePermission(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      next(ApiError.unauthenticated('Sign in to continue.'));
      return;
    }

    const missing = required.filter((permission) => !auth.permissions.includes(permission));
    if (missing.length > 0) {
      next(
        ApiError.forbidden(
          `You do not have permission to perform this action (requires: ${missing.join(', ')}).`,
        ),
      );
      return;
    }

    next();
  };
}

/** Requires ANY one of the listed permissions. */
export function requireAnyPermission(...accepted: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      next(ApiError.unauthenticated('Sign in to continue.'));
      return;
    }
    if (!accepted.some((permission) => auth.permissions.includes(permission))) {
      next(ApiError.forbidden('You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}

/**
 * Role gate. Used only where a permission would be the wrong abstraction -
 * the Super Admin console, which is about identity rather than capability.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      next(ApiError.unauthenticated('Sign in to continue.'));
      return;
    }
    if (!roles.includes(auth.role)) {
      next(ApiError.forbidden('This area is restricted.'));
      return;
    }
    next();
  };
}

/**
 * Blocks writes from demo accounts.
 *
 * Demo logins are public, so without this any visitor could change the shared
 * demo password or delete the account and break the demo for everyone else.
 * Trading and portfolio actions stay open - that is the point of the demo.
 */
export function blockDemoAccounts(action = 'change account settings') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.auth?.isDemo) {
      next(
        new ApiError(
          403,
          ERROR_CODES.DEMO_ACCOUNT_RESTRICTED,
          `Demo accounts cannot ${action}. Register a free account to use this feature.`,
        ),
      );
      return;
    }
    next();
  };
}

/** Requires a verified email address. */
export function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.auth;
  if (!auth) {
    next(ApiError.unauthenticated('Sign in to continue.'));
    return;
  }
  if (auth.user.emailVerifiedAt === null) {
    next(
      new ApiError(
        403,
        ERROR_CODES.EMAIL_NOT_VERIFIED,
        'Verify your email address to use this feature.',
      ),
    );
    return;
  }
  next();
}

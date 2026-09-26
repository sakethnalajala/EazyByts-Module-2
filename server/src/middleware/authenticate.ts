import type { NextFunction, Request, Response } from 'express';
import { ERROR_CODES, type Permission, type Role } from '@smd/shared';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { User, type UserDocument } from '../modules/users/user.model.js';
import { getRoleEntry } from '../modules/roles/role.service.js';

/** Everything a handler needs about the caller, resolved once per request. */
export interface AuthContext {
  userId: string;
  user: UserDocument;
  role: Role;
  permissions: Permission[];
  isDemo: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Verifies the access token and loads the caller.
 *
 * The user document is re-read on every request rather than trusted from the
 * token. That costs one indexed lookup and buys correctness: a suspended or
 * deleted account stops working immediately instead of at token expiry.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearer(req);
  if (!token) {
    next(ApiError.unauthenticated('Sign in to continue.'));
    return;
  }

  const result = verifyAccessToken(token);
  if (!result.ok) {
    next(
      result.reason === 'expired'
        ? new ApiError(401, ERROR_CODES.TOKEN_EXPIRED, 'Your session has expired.')
        : ApiError.unauthenticated('Your session is no longer valid. Please sign in again.'),
    );
    return;
  }

  const user = await User.findById(result.claims.sub);
  if (!user) {
    next(ApiError.unauthenticated('Your account no longer exists.'));
    return;
  }

  if (user.status === 'suspended') {
    next(
      new ApiError(
        403,
        ERROR_CODES.ACCOUNT_SUSPENDED,
        'This account has been suspended. Contact an administrator.',
      ),
    );
    return;
  }

  const roleEntry = await getRoleEntry(user.role);

  // A Super Admin changing a role's permissions bumps this version, which
  // retires every token minted under the previous bundle.
  if (result.claims.pv !== roleEntry.permissionVersion) {
    next(
      new ApiError(
        401,
        ERROR_CODES.TOKEN_EXPIRED,
        'Your permissions changed. Please sign in again.',
      ),
    );
    return;
  }

  req.auth = {
    userId: user.id,
    user,
    role: user.role,
    permissions: roleEntry.permissions,
    isDemo: user.isDemo,
  };

  next();
}

/** Resolves the caller when a token is present, but never rejects. */
export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!extractBearer(req)) {
    next();
    return;
  }
  await authenticate(req, res, (error?: unknown) => {
    // An invalid token on an optional route is simply an anonymous request.
    if (error) req.auth = undefined;
    next();
  });
}

/** Narrowing helper; throws rather than returning undefined. */
export function requireAuth(req: Request): AuthContext {
  if (!req.auth) throw ApiError.unauthenticated('Sign in to continue.');
  return req.auth;
}

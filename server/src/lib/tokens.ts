import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { AccessTokenClaims, Role } from '@smd/shared';
import { env } from '../config/env.js';

/**
 * Token minting and hashing.
 *
 * Access tokens are stateless JWTs. Refresh tokens are opaque random strings -
 * a JWT would tell an attacker the token's structure for nothing in return,
 * and opacity lets us revoke by lookup.
 */

const ACCESS_TTL_SECONDS = env.ACCESS_TOKEN_TTL_MINUTES * 60;
const REFRESH_TTL_MS = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface AccessTokenPayload {
  userId: string;
  role: Role;
  permissionVersion: number;
}

export function signAccessToken({ userId, role, permissionVersion }: AccessTokenPayload): string {
  const claims: AccessTokenClaims = { sub: userId, role, pv: permissionVersion, type: 'access' };
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TTL_SECONDS,
    issuer: 'smd-api',
    audience: 'smd-client',
  });
}

export type VerifyResult =
  { ok: true; claims: AccessTokenClaims } | { ok: false; reason: 'expired' | 'invalid' };

export function verifyAccessToken(token: string): VerifyResult {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'smd-api',
      audience: 'smd-client',
    });

    if (typeof decoded === 'string' || decoded.type !== 'access') {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, claims: decoded as unknown as AccessTokenClaims };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'invalid' };
  }
}

export const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TTL_SECONDS;

/** A 256-bit opaque refresh token, URL-safe. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function newTokenFamily(): string {
  return randomUUID();
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_MS);
}

/**
 * Tokens are stored hashed. SHA-256 (not argon2) is deliberate: these are
 * already high-entropy random values, so there is nothing to brute-force, and
 * lookups must be fast enough to run on every refresh.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Single-use token for email verification / password reset, plus its hash. */
export function generateVerificationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export const REFRESH_TOKEN_TTL_MS = REFRESH_TTL_MS;

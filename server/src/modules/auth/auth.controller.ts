import type { CookieOptions, Request, Response } from 'express';
import {
  type ChangePasswordInput,
  type DemoLoginInput,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from '@smd/shared';
import { env, isProduction } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/response.js';
import { body } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { REFRESH_TOKEN_TTL_MS } from '../../lib/tokens.js';
import * as authService from './auth.service.js';

/**
 * Refresh cookie options.
 *
 * httpOnly so JavaScript cannot read it, and scoped to the refresh path so it
 * is not attached to every API call. SameSite is Lax by default because the
 * Vercel proxy makes the API same-origin with the SPA - the whole reason that
 * proxy exists is to avoid needing SameSite=None here.
 */
function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    path: '/api/v1/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

function contextFrom(req: Request): authService.RequestContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(env.REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}

function clearRefreshCookie(res: Response): void {
  const { maxAge: _maxAge, ...options } = refreshCookieOptions();
  res.clearCookie(env.REFRESH_COOKIE_NAME, options);
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[env.REFRESH_COOKIE_NAME];
}

// ----------------------------------------------------------------- handlers

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const result = await authService.register(body<RegisterInput>(req));
  sendSuccess(
    res,
    {
      user: result.user,
      emailDelivered: result.emailDelivered,
      ...(result.verificationUrl ? { verificationUrl: result.verificationUrl } : {}),
      message: result.emailDelivered
        ? 'Account created. Check your inbox to verify your email address.'
        : 'Account created. Email delivery is not configured, so use the verification link provided.',
    },
    201,
  );
}

export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  const user = await authService.verifyEmail(body<VerifyEmailInput>(req).token);
  sendSuccess(res, { user, message: 'Your email address has been verified. You can now sign in.' });
}

export async function resendVerificationHandler(req: Request, res: Response): Promise<void> {
  const result = await authService.resendVerification(body<{ email: string }>(req).email);
  sendSuccess(res, {
    ...result,
    message: 'If that address needs verification, a new link has been sent.',
  });
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const issued = await authService.login(body<LoginInput>(req), contextFrom(req));
  setRefreshCookie(res, issued.refreshToken);
  sendSuccess(res, issued.session);
}

export async function demoLoginHandler(req: Request, res: Response): Promise<void> {
  const issued = await authService.demoLogin(body<DemoLoginInput>(req).role, contextFrom(req));
  setRefreshCookie(res, issued.refreshToken);
  sendSuccess(res, issued.session);
}

export function demoAccountsHandler(_req: Request, res: Response): void {
  sendSuccess(res, {
    accounts: authService.listDemoAccounts(),
    notice:
      'These are shared public demo accounts on a simulated platform. They cannot change their own credentials.',
  });
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const token = readRefreshCookie(req);
  if (!token) {
    clearRefreshCookie(res);
    throw ApiError.unauthenticated('No active session. Please sign in.');
  }

  try {
    const issued = await authService.refresh(token, contextFrom(req));
    setRefreshCookie(res, issued.refreshToken);
    sendSuccess(res, issued.session);
  } catch (error) {
    // A failed refresh means the cookie is worthless; do not leave it behind
    // to cause a retry loop in the client.
    clearRefreshCookie(res);
    throw error;
  }
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  sendSuccess(res, { message: 'Signed out.' });
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  sendSuccess(res, { user: await authService.toPublicUser(auth.user) });
}

export async function forgotPasswordHandler(req: Request, res: Response): Promise<void> {
  const result = await authService.forgotPassword(body<ForgotPasswordInput>(req).email);
  sendSuccess(res, {
    ...result,
    message: 'If an account exists for that address, a reset link has been sent.',
  });
}

export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  const input = body<ResetPasswordInput>(req);
  await authService.resetPassword(input.token, input.password);
  clearRefreshCookie(res);
  sendSuccess(res, {
    message: 'Your password has been reset. Sign in with your new password.',
  });
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const input = body<ChangePasswordInput>(req);
  await authService.changePassword(auth.userId, input.currentPassword, input.newPassword);
  clearRefreshCookie(res);
  sendSuccess(res, {
    message: 'Password updated. You have been signed out of all devices.',
  });
}

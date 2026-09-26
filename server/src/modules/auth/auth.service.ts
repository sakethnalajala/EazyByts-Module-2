import {
  ERROR_CODES,
  ROLE_LABELS,
  type AuthSession,
  type DemoAccountInfo,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
  type Role,
} from '@smd/shared';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  generateRefreshToken,
  generateVerificationToken,
  hashToken,
  newTokenFamily,
  refreshTokenExpiry,
  signAccessToken,
} from '../../lib/tokens.js';
import { User, type UserDocument } from '../users/user.model.js';
import { RefreshToken, VerificationToken } from './token.model.js';
import { getRoleEntry } from '../roles/role.service.js';
import { ensureWallets } from '../portfolios/portfolio.service.js';
import { getSystemConfig } from '../admin/config.service.js';
import {
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
  sendMail,
} from '../../services/email/mailer.js';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

// ---------------------------------------------------------------- serialising

export async function toPublicUser(user: UserDocument): Promise<PublicUser> {
  const roleEntry = await getRoleEntry(user.role);
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    role: user.role,
    status: user.status,
    isDemo: user.isDemo,
    emailVerified: user.emailVerifiedAt !== null,
    permissions: roleEntry.permissions,
    preferences: {
      theme: user.preferences.theme,
      defaultMarket: user.preferences.defaultMarket,
      widgets: user.preferences.widgets.map((w) => ({
        id: w.id,
        visible: w.visible,
        order: w.order,
      })),
      emailNotifications: user.preferences.emailNotifications,
    },
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

// -------------------------------------------------------------------- session

export interface IssuedSession {
  session: AuthSession;
  refreshToken: string;
}

async function issueSession(
  user: UserDocument,
  context: RequestContext,
  family?: string,
): Promise<IssuedSession> {
  const roleEntry = await getRoleEntry(user.role);

  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    permissionVersion: roleEntry.permissionVersion,
  });

  const refreshToken = generateRefreshToken();
  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    family: family ?? newTokenFamily(),
    expiresAt: refreshTokenExpiry(),
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return {
    session: {
      user: await toPublicUser(user),
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    },
    refreshToken,
  };
}

// ------------------------------------------------------------------- register

export interface RegisterResult {
  user: PublicUser;
  /** Present only when SMTP is unconfigured, so the dev can click the link. */
  verificationUrl?: string;
  emailDelivered: boolean;
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const config = await getSystemConfig();
  if (!config.registrationEnabled) {
    throw new ApiError(
      403,
      ERROR_CODES.FORBIDDEN,
      'New registrations are currently disabled. Please try again later.',
    );
  }

  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) {
    // Registration is one of the few places where enumeration is unavoidable -
    // the user must be told the address is taken. Login and reset stay generic.
    throw ApiError.conflict(ERROR_CODES.CONFLICT, 'An account with that email already exists.');
  }

  const user = await User.create({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    firstName: input.firstName,
    lastName: input.lastName,
    /*
     * Validation has already narrowed this to 'user' | 'trader'
     * (SELF_SERVICE_ROLES), so an attacker cannot register themselves as an
     * admin by adding a field to the request body.
     */
    role: input.role,
    status: 'pending',
  });

  // Both wallets are opened at registration so the dashboard has something
  // coherent to show the moment the account is verified.
  await ensureWallets(user._id);

  const { url, delivered } = await issueVerificationEmail(user);

  return {
    user: await toPublicUser(user),
    ...(delivered ? {} : { verificationUrl: url }),
    emailDelivered: delivered,
  };
}

async function issueVerificationEmail(
  user: UserDocument,
): Promise<{ url: string; delivered: boolean }> {
  // Retire any outstanding verification token so only the newest link works.
  await VerificationToken.updateMany(
    { userId: user._id, type: 'verify', usedAt: null },
    { $set: { usedAt: new Date() } },
  );

  const { token, tokenHash } = generateVerificationToken();
  await VerificationToken.create({
    userId: user._id,
    type: 'verify',
    tokenHash,
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
  });

  const url = `${env.APP_URL}/verify-email?token=${token}`;
  const result = await sendMail(buildVerificationEmail(user.email, user.firstName, url));
  return { url, delivered: result.delivered };
}

export async function verifyEmail(token: string): Promise<PublicUser> {
  const record = await VerificationToken.findOne({
    tokenHash: hashToken(token),
    type: 'verify',
  });

  if (!record || record.usedAt !== null || record.expiresAt.getTime() < Date.now()) {
    throw ApiError.badRequest('This verification link is invalid or has expired.');
  }

  const user = await User.findById(record.userId);
  if (!user) throw ApiError.notFound('Account not found.');

  // Mark the token used before activating, so a replayed request cannot
  // re-activate a subsequently suspended account.
  record.usedAt = new Date();
  await record.save();

  if (user.emailVerifiedAt === null) {
    user.emailVerifiedAt = new Date();
    // Only promote a pending account; never resurrect a suspended one.
    if (user.status === 'pending') user.status = 'active';
    await user.save();
  }

  return toPublicUser(user);
}

export async function resendVerification(email: string): Promise<{ sent: boolean; url?: string }> {
  const user = await User.findOne({ email });

  // Always reports success: otherwise this endpoint becomes an account oracle.
  if (!user || user.emailVerifiedAt !== null) return { sent: true };

  const { url, delivered } = await issueVerificationEmail(user);
  return delivered ? { sent: true } : { sent: true, url };
}

// ---------------------------------------------------------------------- login

export async function login(input: LoginInput, context: RequestContext): Promise<IssuedSession> {
  // The hash is `select: false` on the schema, so ask for it explicitly.
  const user = await User.findOne({ email: input.email }).select('+passwordHash');

  const genericFailure = new ApiError(
    401,
    ERROR_CODES.UNAUTHENTICATED,
    'Incorrect email or password.',
  );

  if (!user) {
    // Hash a throwaway value so a missing account takes as long as a wrong
    // password. Without this the response time leaks which emails exist.
    await verifyPassword(
      '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000',
      input.password,
    );
    throw genericFailure;
  }

  if (user.isLocked()) {
    throw new ApiError(
      423,
      ERROR_CODES.ACCOUNT_LOCKED,
      'Too many failed attempts. This account is temporarily locked. Try again in 15 minutes.',
    );
  }

  const passwordMatches = await verifyPassword(user.passwordHash, input.password);

  if (!passwordMatches) {
    user.failedLoginCount += 1;
    if (user.failedLoginCount >= MAX_FAILED_LOGINS) {
      user.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
      user.failedLoginCount = 0;
      logger.warn({ userId: user.id, ip: context.ip }, 'Account locked after repeated failures');
    }
    await user.save();
    throw genericFailure;
  }

  if (user.status === 'suspended') {
    throw new ApiError(
      403,
      ERROR_CODES.ACCOUNT_SUSPENDED,
      'This account has been suspended. Please contact an administrator.',
    );
  }

  if (user.emailVerifiedAt === null && !user.isDemo) {
    throw new ApiError(
      403,
      ERROR_CODES.EMAIL_NOT_VERIFIED,
      'Please verify your email address before signing in. Check your inbox for the link.',
    );
  }

  user.failedLoginCount = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save();

  // Covers accounts created before a wallet existed, and demo resets.
  await ensureWallets(user._id);

  return issueSession(user, context);
}

// ----------------------------------------------------------------- demo login

/**
 * The four public demo accounts.
 *
 * Each carries its OWN password. They are documented publicly and shown on
 * the sign-in screen by design - these are throwaway accounts on a simulated
 * platform, not credentials worth protecting. They are still stored only as
 * argon2id hashes; nothing here is written to the database in plaintext.
 *
 * This list is the single source of truth. The seed hashes from it and the
 * sign-in screen displays from it, through `resolveDemoPassword` below, so
 * the credential shown can never drift from the one that actually works.
 */
export const DEMO_ACCOUNTS: readonly DemoAccountInfo[] = [
  {
    role: 'user',
    label: ROLE_LABELS.user,
    email: 'user.demo@stockdashboard.com',
    password: 'U$erDemo#47Xq!9',
    description:
      'View-only account: explore the market, follow a watchlist, read news and work through the education library. No trading.',
  },
  {
    role: 'trader',
    label: ROLE_LABELS.trader,
    email: 'trader.demo@stockdashboard.com',
    password: 'Tr@derDemo#82Lm!5',
    description:
      'Full trading experience: place orders, manage a portfolio, build watchlists and set alerts.',
  },
  {
    role: 'admin',
    label: ROLE_LABELS.admin,
    email: 'admin.demo@stockdashboard.com',
    password: 'Adm!nDemo#63Vk@8',
    description:
      'Everything a trader can do, plus user management, trade monitoring and content administration.',
  },
  {
    role: 'super_admin',
    label: ROLE_LABELS.super_admin,
    email: 'superadmin.demo@stockdashboard.com',
    password: 'Sup3rAdm!n#91Zp@6',
    description:
      'Full platform control: manage admins, edit role permissions, configure the platform and monitor system health.',
  },
];

/**
 * The password a given demo account actually uses.
 *
 * `DEMO_PASSWORD` remains supported as a GLOBAL override, so a public deploy
 * can lock every demo account behind one rotated secret without a code
 * change. Unset - the normal case - each account keeps its own password.
 *
 * Both the seed and the sign-in screen call this, which is what stops the
 * displayed credential drifting from the stored hash.
 */
export function resolveDemoPassword(account: Pick<DemoAccountInfo, 'password'>): string {
  return env.DEMO_PASSWORD ?? account.password;
}

export function listDemoAccounts(): DemoAccountInfo[] {
  return DEMO_ACCOUNTS.map((account) => ({
    ...account,
    password: resolveDemoPassword(account),
  }));
}

/**
 * Signs in as a seeded demo account.
 *
 * The client sends only a role - never a password - so the public demo
 * credentials cannot be changed from the browser, and a reviewer can switch
 * roles in one click.
 */
export async function demoLogin(role: Role, context: RequestContext): Promise<IssuedSession> {
  const account = DEMO_ACCOUNTS.find((entry) => entry.role === role);
  if (!account) throw ApiError.badRequest('Unknown demo role.');

  const user = await User.findOne({ email: account.email, isDemo: true });
  if (!user) {
    throw new ApiError(
      503,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      'Demo accounts are not available. Run the database seed to create them.',
    );
  }

  if (user.status === 'suspended') {
    throw new ApiError(
      403,
      ERROR_CODES.ACCOUNT_SUSPENDED,
      'This demo account is currently suspended.',
    );
  }

  user.lastLoginAt = new Date();
  await user.save();
  await ensureWallets(user._id);

  return issueSession(user, context);
}

// -------------------------------------------------------------------- refresh

/**
 * Rotates a refresh token.
 *
 * Reuse detection: if a token that has already been rotated is presented
 * again, the whole family is revoked. That is the standard response to a
 * stolen token - the thief and the victim both get logged out, rather than the
 * thief silently keeping a session alive.
 */
export async function refresh(
  presentedToken: string,
  context: RequestContext,
): Promise<IssuedSession> {
  const tokenHash = hashToken(presentedToken);
  const record = await RefreshToken.findOne({ tokenHash });

  if (!record) {
    throw ApiError.unauthenticated('Your session has expired. Please sign in again.');
  }

  if (record.revokedAt !== null) {
    await RefreshToken.updateMany(
      { family: record.family, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    logger.warn(
      { userId: record.userId.toString(), family: record.family, ip: context.ip },
      'Refresh token reuse detected; revoking entire token family',
    );
    throw new ApiError(
      401,
      ERROR_CODES.TOKEN_REUSED,
      'This session was already used elsewhere and has been closed for your security. Please sign in again.',
    );
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw ApiError.unauthenticated('Your session has expired. Please sign in again.');
  }

  const user = await User.findById(record.userId);
  if (!user) throw ApiError.unauthenticated('Your account no longer exists.');
  if (user.status === 'suspended') {
    throw new ApiError(403, ERROR_CODES.ACCOUNT_SUSPENDED, 'This account has been suspended.');
  }

  const issued = await issueSession(user, context, record.family);

  record.revokedAt = new Date();
  record.replacedByHash = hashToken(issued.refreshToken);
  await record.save();

  return issued;
}

export async function logout(presentedToken: string | undefined): Promise<void> {
  if (!presentedToken) return;

  const record = await RefreshToken.findOne({ tokenHash: hashToken(presentedToken) });
  if (!record) return;

  // Revoke the whole family, not just this token: logging out should end the
  // session everywhere it was rotated to.
  await RefreshToken.updateMany(
    { family: record.family, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function logoutAllSessions(userId: string): Promise<void> {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

// ------------------------------------------------------------- password reset

export async function forgotPassword(email: string): Promise<{ url?: string }> {
  const user = await User.findOne({ email });

  // Always returns 200 with no hint. An attacker must not learn which
  // addresses have accounts from this endpoint.
  if (!user || user.isDemo) return {};

  await VerificationToken.updateMany(
    { userId: user._id, type: 'reset', usedAt: null },
    { $set: { usedAt: new Date() } },
  );

  const { token, tokenHash } = generateVerificationToken();
  await VerificationToken.create({
    userId: user._id,
    type: 'reset',
    tokenHash,
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });

  const url = `${env.APP_URL}/reset-password?token=${token}`;
  const result = await sendMail(buildPasswordResetEmail(user.email, user.firstName, url));

  return result.delivered ? {} : { url };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await VerificationToken.findOne({ tokenHash: hashToken(token), type: 'reset' });

  if (!record || record.usedAt !== null || record.expiresAt.getTime() < Date.now()) {
    throw ApiError.badRequest(
      'This reset link is invalid or has expired. Please request a new one.',
    );
  }

  const user = await User.findById(record.userId);
  if (!user) throw ApiError.notFound('Account not found.');

  record.usedAt = new Date();
  await record.save();

  user.passwordHash = await hashPassword(newPassword);
  user.failedLoginCount = 0;
  user.lockedUntil = null;
  // A reset also proves control of the mailbox.
  if (user.emailVerifiedAt === null) {
    user.emailVerifiedAt = new Date();
    if (user.status === 'pending') user.status = 'active';
  }
  await user.save();

  // Every existing session is invalidated: if the reset was triggered because
  // the account was compromised, leaving the attacker's session alive would
  // defeat the point.
  await logoutAllSessions(user.id);

  await sendMail(buildPasswordChangedEmail(user.email, user.firstName));
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('Account not found.');

  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect.');
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  await logoutAllSessions(userId);
  await sendMail(buildPasswordChangedEmail(user.email, user.firstName));
}

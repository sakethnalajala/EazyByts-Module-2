import type { Express } from 'express';
import request from 'supertest';
import type { Role } from '@smd/shared';
import { User, type UserDocument } from '../../modules/users/user.model.js';
import { Instrument, type InstrumentDocument } from '../../modules/instruments/instrument.model.js';
import { hashPassword } from '../../lib/password.js';
import { ensureRolesSeeded } from '../../modules/roles/role.service.js';
import { ensureWallets } from '../../modules/portfolios/portfolio.service.js';

export const TEST_PASSWORD = 'TestPass123';

/** Roles must exist before anything authenticates; cheap enough to call often. */
export async function seedRoles(): Promise<void> {
  await ensureRolesSeeded();
}

export interface CreateUserOptions {
  email?: string;
  password?: string;
  role?: Role;
  status?: 'pending' | 'active' | 'suspended';
  verified?: boolean;
  isDemo?: boolean;
  firstName?: string;
  lastName?: string;
  withWallets?: boolean;
}

export async function createUser(options: CreateUserOptions = {}): Promise<UserDocument> {
  const {
    email = `user${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`,
    password = TEST_PASSWORD,
    role = 'trader',
    status = 'active',
    verified = true,
    isDemo = false,
    firstName = 'Test',
    lastName = 'User',
    withWallets = true,
  } = options;

  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    firstName,
    lastName,
    role,
    status,
    isDemo,
    emailVerifiedAt: verified ? new Date() : null,
  });

  if (withWallets) await ensureWallets(user._id);
  return user;
}

export interface AuthedUser {
  user: UserDocument;
  accessToken: string;
  /** Raw Set-Cookie values, for driving the refresh endpoint. */
  cookies: string[];
  auth: (req: request.Test) => request.Test;
}

/** Creates a user and logs them in through the real HTTP login route. */
export async function createAuthedUser(
  app: Express,
  options: CreateUserOptions = {},
): Promise<AuthedUser> {
  await seedRoles();
  const password = options.password ?? TEST_PASSWORD;
  const user = await createUser({ ...options, password });

  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: user.email, password });

  if (response.status !== 200) {
    throw new Error(`Test login failed (${response.status}): ${JSON.stringify(response.body)}`);
  }

  const accessToken = response.body.data.accessToken as string;
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];

  return {
    user,
    accessToken,
    cookies,
    auth: (req) => req.set('Authorization', `Bearer ${accessToken}`),
  };
}

export interface CreateInstrumentOptions {
  symbol?: string;
  exchange?: 'NSE' | 'BSE' | 'NASDAQ' | 'NYSE';
  name?: string;
  /** MAJOR units; converted to minor internally. */
  referencePrice?: number;
  isActive?: boolean;
}

export async function createInstrument(
  options: CreateInstrumentOptions = {},
): Promise<InstrumentDocument> {
  const {
    symbol = 'TESTCO',
    exchange = 'NSE',
    name = 'Test Company Ltd',
    referencePrice = 1000,
    isActive = true,
  } = options;

  const market = exchange === 'NSE' || exchange === 'BSE' ? 'IN' : 'US';
  const currency = market === 'IN' ? 'INR' : 'USD';
  const providerSymbol =
    exchange === 'NSE' ? `${symbol}.NS` : exchange === 'BSE' ? `${symbol}.BO` : symbol;

  return Instrument.create({
    symbol,
    exchange,
    market,
    currency,
    name,
    sector: 'Testing',
    providerSymbol,
    isActive,
    referencePrice: Math.round(referencePrice * 100),
  });
}

/** Extracts a named cookie's value from a Set-Cookie array. */
export function cookieValue(cookies: string[], name: string): string | null {
  for (const cookie of cookies) {
    const match = new RegExp(`${name}=([^;]+)`).exec(cookie);
    if (match?.[1]) return match[1];
  }
  return null;
}

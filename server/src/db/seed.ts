import mongoose from 'mongoose';
import { EXCHANGES, MARKET_TO_CURRENCY, EXCHANGE_TO_MARKET, toMinor, type Role } from '@smd/shared';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { User } from '../modules/users/user.model.js';
import { Instrument } from '../modules/instruments/instrument.model.js';
import { EducationResourceModel } from '../modules/education/education.model.js';
import { Watchlist } from '../modules/watchlists/watchlist.model.js';
import { ensureRolesSeeded } from '../modules/roles/role.service.js';
import { ensureWallets } from '../modules/portfolios/portfolio.service.js';
import { getSystemConfig } from '../modules/admin/config.service.js';
import { hashPassword } from '../lib/password.js';
import { DEMO_ACCOUNTS } from '../modules/auth/auth.service.js';
import { seedDemoContent } from './demoData.js';
import { seedDemoTrading } from './demoTrading.js';
import { INSTRUMENT_SEED, toProviderSymbol } from './instruments.data.js';
import { EDUCATION_SEED } from './education.data.js';

/**
 * Idempotent database seed.
 *
 * Every step upserts, so running this against an existing database tops it up
 * rather than destroying data. That matters because it runs on deploy.
 */

async function seedInstruments(): Promise<number> {
  let count = 0;

  for (const exchange of EXCHANGES) {
    const market = EXCHANGE_TO_MARKET[exchange];
    const currency = MARKET_TO_CURRENCY[market];

    for (const seed of INSTRUMENT_SEED[exchange]) {
      await Instrument.updateOne(
        { symbol: seed.symbol, exchange },
        {
          $set: {
            name: seed.name,
            sector: seed.sector,
            providerSymbol: toProviderSymbol(seed.symbol, exchange),
            market,
            currency,
          },
          $setOnInsert: {
            symbol: seed.symbol,
            exchange,
            isActive: true,
            // Stored in minor units, like every other price in the system.
            referencePrice: toMinor(seed.referencePrice),
          },
        },
        { upsert: true },
      );
      count += 1;
    }
  }

  return count;
}

async function seedEducation(authorId: mongoose.Types.ObjectId | null): Promise<number> {
  for (const article of EDUCATION_SEED) {
    await EducationResourceModel.updateOne(
      { slug: article.slug },
      {
        $set: {
          title: article.title,
          summary: article.summary,
          category: article.category,
          level: article.level,
          content: article.content,
          readMinutes: article.readMinutes,
          tags: article.tags,
          status: 'published',
        },
        $setOnInsert: {
          slug: article.slug,
          authorId,
          authorName: 'Platform Editorial',
        },
      },
      { upsert: true },
    );
  }
  return EDUCATION_SEED.length;
}

interface DemoSeed {
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
}

const DEMO_PROFILES: DemoSeed[] = [
  { role: 'user', email: 'demo.user@smd.local', firstName: 'Demo', lastName: 'User' },
  { role: 'trader', email: 'demo.trader@smd.local', firstName: 'Demo', lastName: 'Trader' },
  { role: 'admin', email: 'demo.admin@smd.local', firstName: 'Demo', lastName: 'Admin' },
  {
    role: 'super_admin',
    email: 'demo.superadmin@smd.local',
    firstName: 'Demo',
    lastName: 'SuperAdmin',
  },
];

async function seedDemoAccounts(): Promise<mongoose.Types.ObjectId[]> {
  const passwordHash = await hashPassword(env.DEMO_PASSWORD);
  const ids: mongoose.Types.ObjectId[] = [];

  for (const profile of DEMO_PROFILES) {
    // The password is reset on every seed so a rotated DEMO_PASSWORD takes
    // effect, and demo accounts are pre-verified so a reviewer is never
    // blocked behind an email they cannot receive.
    const user = await User.findOneAndUpdate(
      { email: profile.email },
      {
        $set: {
          passwordHash,
          role: profile.role,
          status: 'active',
          isDemo: true,
          emailVerifiedAt: new Date(),
        },
        $setOnInsert: {
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );

    await ensureWallets(user._id);
    ids.push(user._id);
  }

  return ids;
}

/** Gives the demo trader a populated watchlist so the UI is not empty. */
async function seedDemoWatchlist(userId: mongoose.Types.ObjectId): Promise<void> {
  const picks = await Instrument.find({
    $or: [
      { symbol: { $in: ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY'] }, exchange: 'NSE' },
      { symbol: { $in: ['AAPL', 'MSFT', 'NVDA'] }, exchange: 'NASDAQ' },
    ],
  }).lean();

  if (picks.length === 0) return;

  await Watchlist.updateOne(
    { userId, name: 'My Watchlist' },
    {
      $setOnInsert: {
        userId,
        name: 'My Watchlist',
        isDefault: true,
        items: picks.map((instrument) => ({
          instrumentId: instrument._id,
          symbol: instrument.symbol,
          exchange: instrument.exchange,
          note: null,
          addedAt: new Date(),
        })),
      },
    },
    { upsert: true },
  );
}

export async function runSeed(): Promise<void> {
  logger.info('Seeding database...');

  await ensureRolesSeeded();
  logger.info('  roles ready');

  await getSystemConfig();
  logger.info('  system config ready');

  const instrumentCount = await seedInstruments();
  logger.info({ instrumentCount }, '  instruments ready');

  const demoIds = await seedDemoAccounts();
  logger.info({ demoAccounts: demoIds.length }, '  demo accounts ready');

  /*
   * Looked up by email rather than by position in DEMO_PROFILES. The list is
   * ordered by privilege and has gained a role before, which silently shifted
   * every index and mis-assigned the education author.
   */
  const adminDoc = await User.findOne({ email: 'demo.admin@smd.local' }).lean();
  const traderDoc = await User.findOne({ email: 'demo.trader@smd.local' }).lean();

  const educationCount = await seedEducation(adminDoc?._id ?? null);
  logger.info({ educationCount }, '  education articles ready');

  if (traderDoc) await seedDemoWatchlist(traderDoc._id);
  logger.info('  demo watchlist ready');

  await seedDemoContent();
  await seedDemoTrading();

  logger.info('Seed complete.');
  logger.info(
    { accounts: DEMO_ACCOUNTS.map((a) => a.email), password: env.DEMO_PASSWORD },
    'Demo credentials',
  );
}

/** Entry point when run directly via `npm run seed`. */
async function main(): Promise<void> {
  await connectDatabase();

  // connectDatabase retries forever rather than throwing, so confirm we really
  // are connected before writing - otherwise the seed hangs silently.
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected) {
    logger.error('Could not connect to MongoDB. Check MONGODB_URI.');
    process.exit(1);
  }

  try {
    await runSeed();
  } catch (error) {
    logger.error({ err: error }, 'Seed failed');
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

// Only run when executed directly, not when imported by a test.
const isDirectRun = process.argv[1]?.includes('seed');
if (isDirectRun) {
  void main();
}

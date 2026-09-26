import type mongoose from 'mongoose';
import type { NotificationType } from '@smd/shared';
import { NewsArticleModel } from '../modules/news/news.model.js';
import { AuditLog } from '../modules/admin/audit.model.js';
import { Notification } from '../modules/notifications/notification.model.js';
import { User } from '../modules/users/user.model.js';
import { Watchlist } from '../modules/watchlists/watchlist.model.js';
import { Instrument } from '../modules/instruments/instrument.model.js';
import { hashPassword } from '../lib/password.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Demo content so no portal renders an empty shell during evaluation.
 *
 * Every write here is idempotent - keyed on a natural unique field and using
 * upserts - so running the seed repeatedly never multiplies rows. Nothing in
 * this file touches a real user's data: it only creates records that carry an
 * unmistakably fake identity (`@smd.local`, `smd-demo` URLs, `isSimulated`).
 *
 * All monetary values are simulated paper-trading figures in minor units.
 */

// --------------------------------------------------------------------- news

interface NewsSeed {
  slug: string;
  title: string;
  summary: string;
  source: string;
  symbols: string[];
  market: 'IN' | 'US';
  ageHours: number;
}

const NEWS: NewsSeed[] = [
  {
    slug: 'nifty-holds-range',
    title: 'Nifty 50 holds its range as IT and banking pull in opposite directions',
    summary:
      'The index closed flat for a third session. Weakness in large-cap IT was offset by buying in private banks, leaving breadth almost perfectly even.',
    source: 'Market Desk',
    symbols: ['TCS', 'INFY', 'HDFCBANK'],
    market: 'IN',
    ageHours: 2,
  },
  {
    slug: 'reliance-capex-guidance',
    title: 'Reliance outlines capital expenditure guidance for the coming year',
    summary:
      'Management reiterated its investment plan across retail and energy. Analysts focused on the funding mix rather than the headline number.',
    source: 'Business Wire',
    symbols: ['RELIANCE'],
    market: 'IN',
    ageHours: 6,
  },
  {
    slug: 'it-margin-watch',
    title: 'IT margin commentary turns cautious ahead of results season',
    summary:
      'Several mid-cap firms flagged pricing pressure on renewals. Wage revisions land in the same quarter, which makes the margin bridge harder to read.',
    source: 'Sector Watch',
    symbols: ['TCS', 'INFY', 'HCLTECH'],
    market: 'IN',
    ageHours: 11,
  },
  {
    slug: 'metals-lead-gainers',
    title: 'Metals lead the gainers as global inventories tighten',
    summary:
      'Base metal producers outperformed on restocking demand. The move is commodity-led rather than company-specific, so it may not persist.',
    source: 'Commodities Daily',
    symbols: ['TATASTEEL', 'HINDALCO'],
    market: 'IN',
    ageHours: 20,
  },
  {
    slug: 'banking-credit-growth',
    title: 'Private banks report steady credit growth, deposit costs still climbing',
    summary:
      'Loan books expanded in line with estimates. The open question remains how long deposit repricing keeps compressing net interest margins.',
    source: 'Financials Review',
    symbols: ['HDFCBANK', 'AXISBANK'],
    market: 'IN',
    ageHours: 28,
  },
  {
    slug: 'us-megacap-earnings',
    title: 'US mega-cap earnings beat on cloud, guidance kept deliberately conservative',
    summary:
      'Cloud revenue carried the quarter. Management guided below consensus, a pattern that has repeated for three straight quarters.',
    source: 'Wall Street Brief',
    symbols: ['MSFT', 'AAPL'],
    market: 'US',
    ageHours: 8,
  },
  {
    slug: 'semis-demand-signal',
    title: 'Semiconductor demand signals diverge between data centre and consumer',
    summary:
      'Data-centre orders remain strong while consumer devices stay soft. The split is now wide enough that a single sector view is unhelpful.',
    source: 'Tech Tape',
    symbols: ['NVDA'],
    market: 'US',
    ageHours: 15,
  },
  {
    slug: 'rates-path-repricing',
    title: 'Rate-path expectations reprice after softer inflation print',
    summary:
      'Short-dated yields fell on the release. Equity markets read it as supportive, though the move was concentrated in rate-sensitive sectors.',
    source: 'Macro Notes',
    symbols: [],
    market: 'US',
    ageHours: 33,
  },
];

async function seedNews(): Promise<number> {
  const now = Date.now();

  for (const item of NEWS) {
    // The URL is the model's unique key, so it doubles as the idempotency key.
    await NewsArticleModel.updateOne(
      { url: `https://smd-demo.local/news/${item.slug}` },
      {
        $setOnInsert: {
          url: `https://smd-demo.local/news/${item.slug}`,
          title: item.title,
          summary: item.summary,
          source: item.source,
          imageUrl: null,
          symbols: item.symbols,
          market: item.market,
          publishedAt: new Date(now - item.ageHours * 3_600_000),
          provider: 'demo',
          isSimulated: true,
        },
      },
      { upsert: true },
    );
  }

  return NewsArticleModel.countDocuments();
}

// -------------------------------------------------------------- extra users

interface ExtraUserSeed {
  email: string;
  firstName: string;
  lastName: string;
  role: 'user' | 'trader' | 'admin';
  status: 'active' | 'pending' | 'suspended';
}

/**
 * A handful of additional accounts so the Admin user table has something to
 * page, filter and sort. All are demo accounts on the reserved domain.
 */
const EXTRA_USERS: ExtraUserSeed[] = [
  { email: 'demo.analyst@smd.local', firstName: 'Demo', lastName: 'Analyst', role: 'user', status: 'active' },
  { email: 'priya.sharma@smd.local', firstName: 'Priya', lastName: 'Sharma', role: 'trader', status: 'active' },
  { email: 'arjun.mehta@smd.local', firstName: 'Arjun', lastName: 'Mehta', role: 'trader', status: 'active' },
  { email: 'neha.iyer@smd.local', firstName: 'Neha', lastName: 'Iyer', role: 'user', status: 'pending' },
  { email: 'rahul.verma@smd.local', firstName: 'Rahul', lastName: 'Verma', role: 'trader', status: 'suspended' },
  { email: 'sana.khan@smd.local', firstName: 'Sana', lastName: 'Khan', role: 'user', status: 'active' },
  { email: 'vikram.rao@smd.local', firstName: 'Vikram', lastName: 'Rao', role: 'admin', status: 'active' },
];

async function seedExtraUsers(): Promise<number> {
  const passwordHash = await hashPassword(env.DEMO_PASSWORD);
  const ids: mongoose.Types.ObjectId[] = [];

  for (const [index, profile] of EXTRA_USERS.entries()) {
    // Staggered join dates give the "new users" analytics something to plot.
    const createdAt = new Date(Date.now() - (index + 2) * 86_400_000 * 3);

    const doc = await User.findOneAndUpdate(
      { email: profile.email },
      {
        $setOnInsert: {
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          passwordHash,
          role: profile.role,
          status: profile.status,
          isDemo: true,
          emailVerifiedAt: profile.status === 'pending' ? null : createdAt,
          createdAt,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    if (doc) ids.push(doc._id);
  }

  return ids.length;
}

// --------------------------------------------------------------- audit logs

interface AuditSeed {
  action: string;
  targetType: string;
  summary: string;
  ageHours: number;
}

const AUDIT_ENTRIES: AuditSeed[] = [
  { action: 'config.update', targetType: 'SystemConfig', summary: 'Enabled the market news feature flag.', ageHours: 3 },
  { action: 'user.status.update', targetType: 'User', summary: 'Suspended rahul.verma@smd.local after repeated failed sign-ins.', ageHours: 9 },
  { action: 'role.permissions.update', targetType: 'Role', summary: 'Granted watchlist:read to the user role.', ageHours: 14 },
  { action: 'instrument.create', targetType: 'Instrument', summary: 'Added HCLTECH (NSE) to the tradable universe.', ageHours: 22 },
  { action: 'admin.create', targetType: 'User', summary: 'Promoted vikram.rao@smd.local to admin.', ageHours: 30 },
  { action: 'education.publish', targetType: 'EducationResource', summary: 'Published "Risk Management Basics".', ageHours: 38 },
  { action: 'config.update', targetType: 'SystemConfig', summary: 'Set opening capital to Rs 10,00,000 and $10,000.', ageHours: 47 },
  { action: 'user.status.update', targetType: 'User', summary: 'Reactivated sana.khan@smd.local.', ageHours: 55 },
  { action: 'instrument.update', targetType: 'Instrument', summary: 'Corrected the sector on ASIANPAINT.', ageHours: 66 },
  { action: 'auth.demo.login', targetType: 'Session', summary: 'Demo super admin session opened for evaluation.', ageHours: 72 },
];

async function seedAuditLogs(): Promise<number> {
  const actor = await User.findOne({ email: 'demo.superadmin@smd.local' }).lean();

  for (const [index, entry] of AUDIT_ENTRIES.entries()) {
    const createdAt = new Date(Date.now() - entry.ageHours * 3_600_000);

    /*
     * Audit rows have no natural unique key, so a stable synthetic one is
     * stamped into targetId. Keying on createdAt instead looked right but was
     * NOT idempotent - the timestamp is computed from Date.now() on every run,
     * so each seed inserted a fresh copy of the whole log.
     */
    const seedKey = `demo-seed:audit:${String(index)}`;

    await AuditLog.updateOne(
      { targetId: seedKey },
      {
        $setOnInsert: {
          actorId: actor?._id ?? null,
          actorEmail: actor?.email ?? 'demo.superadmin@smd.local',
          actorRole: 'super_admin',
          action: entry.action,
          targetType: entry.targetType,
          targetId: seedKey,
          summary: entry.summary,
          before: null,
          after: null,
          ip: '127.0.0.1',
          createdAt,
        },
      },
      { upsert: true, timestamps: false },
    );
  }

  return AuditLog.countDocuments();
}

// ------------------------------------------------------------ notifications

const NOTIFICATIONS: { title: string; body: string; type: NotificationType; ageHours: number }[] = [
  { title: 'Welcome to the platform', body: 'Your demo account is ready. Everything here is simulated - no real money is involved.', type: 'ACCOUNT', ageHours: 1 },
  { title: 'Markets closed', body: 'NSE and BSE have closed for the day. Orders placed now queue for the next session.', type: 'SYSTEM', ageHours: 5 },
  { title: 'Education: new resource', body: '"Reading Candlestick Charts" has been added to the learning library.', type: 'SYSTEM', ageHours: 26 },
  { title: 'Watchlist movement', body: 'RELIANCE moved more than 3% during today’s session.', type: 'ALERT_TRIGGERED', ageHours: 30 },
];

async function seedNotificationsFor(userId: mongoose.Types.ObjectId): Promise<void> {
  for (const item of NOTIFICATIONS) {
    const createdAt = new Date(Date.now() - item.ageHours * 3_600_000);
    await Notification.updateOne(
      { userId, title: item.title },
      {
        $setOnInsert: {
          userId,
          title: item.title,
          body: item.body,
          type: item.type,
          readAt: item.ageHours > 24 ? createdAt : null,
          createdAt,
        },
      },
      { upsert: true, timestamps: false },
    );
  }
}

// ---------------------------------------------------------------- watchlist

/** Gives an account a populated watchlist so the portal is never empty. */
async function seedWatchlistFor(
  userId: mongoose.Types.ObjectId,
  symbols: string[],
): Promise<void> {
  const picks = await Instrument.find({ symbol: { $in: symbols }, exchange: 'NSE' }).lean();
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

// ------------------------------------------------------------------- runner

export async function seedDemoContent(): Promise<void> {
  const newsCount = await seedNews();
  logger.info({ news: newsCount }, '  demo news ready');

  const extraUsers = await seedExtraUsers();
  logger.info({ extraUsers }, '  demo user accounts ready');

  const auditCount = await seedAuditLogs();
  logger.info({ auditLogs: auditCount }, '  demo audit log ready');

  const demoUser = await User.findOne({ email: 'demo.user@smd.local' }).lean();
  if (demoUser) {
    await seedWatchlistFor(demoUser._id, ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'AXISBANK']);
    await seedNotificationsFor(demoUser._id);
    logger.info('  demo user watchlist and notifications ready');
  }

  for (const email of ['demo.admin@smd.local', 'demo.superadmin@smd.local']) {
    const account = await User.findOne({ email }).lean();
    if (account) await seedNotificationsFor(account._id);
  }
}

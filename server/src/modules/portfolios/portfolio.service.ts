import type { ClientSession, Types } from 'mongoose';
import {
  DEFAULT_INITIAL_CAPITAL_MINOR,
  MARKETS,
  MARKET_TO_CURRENCY,
  type Market,
} from '@smd/shared';
import { Portfolio, type PortfolioDocument } from './portfolio.model.js';
import { getSystemConfig } from '../admin/config.service.js';

/**
 * Creates the two segregated wallets for a user if they do not already exist.
 *
 * Every user gets exactly one INR wallet and one USD wallet. Opening balances
 * come from runtime config so a Super Admin can change them, falling back to
 * the agreed defaults (Rs 10,00,000 and $10,000, in minor units).
 *
 * Idempotent: safe to call on every login, which is how a user created before
 * a market existed still ends up with both wallets.
 */
export async function ensureWallets(
  userId: Types.ObjectId,
  session?: ClientSession,
): Promise<PortfolioDocument[]> {
  const config = await getSystemConfig();

  const capital: Record<Market, number> = {
    IN: config.initialCapitalInr ?? DEFAULT_INITIAL_CAPITAL_MINOR.IN,
    US: config.initialCapitalUsd ?? DEFAULT_INITIAL_CAPITAL_MINOR.US,
  };

  for (const market of MARKETS) {
    await Portfolio.updateOne(
      { userId, market },
      {
        $setOnInsert: {
          userId,
          market,
          currency: MARKET_TO_CURRENCY[market],
          cashAvailable: capital[market],
          cashBlocked: 0,
          initialCapital: capital[market],
          realisedPnl: 0,
          totalFeesPaid: 0,
        },
      },
      { upsert: true, ...(session ? { session } : {}) },
    );
  }

  const query = Portfolio.find({ userId });
  if (session) query.session(session);
  return query.exec();
}

export async function getWallet(
  userId: Types.ObjectId | string,
  market: Market,
  session?: ClientSession,
): Promise<PortfolioDocument | null> {
  const query = Portfolio.findOne({ userId, market });
  if (session) query.session(session);
  return query.exec();
}

export async function getWallets(userId: Types.ObjectId | string): Promise<PortfolioDocument[]> {
  return Portfolio.find({ userId }).sort({ market: 1 }).exec();
}

/**
 * Resets a wallet to its opening balance. Used by the nightly demo-account
 * reset so the public demo does not drift into a meaningless state.
 */
export async function resetWallet(portfolio: PortfolioDocument): Promise<void> {
  portfolio.cashAvailable = portfolio.initialCapital;
  portfolio.cashBlocked = 0;
  portfolio.realisedPnl = 0;
  portfolio.totalFeesPaid = 0;
  await portfolio.save();
}

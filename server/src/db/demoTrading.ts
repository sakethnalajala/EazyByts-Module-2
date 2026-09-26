import type mongoose from 'mongoose';
import { calculateFees, buyCost, sellProceeds } from '../services/trading/fees.js';
import { Order, Transaction } from '../modules/orders/order.model.js';
import { Holding, Portfolio } from '../modules/portfolios/portfolio.model.js';
import { Alert } from '../modules/alerts/alert.model.js';
import { Instrument } from '../modules/instruments/instrument.model.js';
import { getQuote } from '../services/market/marketData.service.js';
import { Notification } from '../modules/notifications/notification.model.js';
import { User } from '../modules/users/user.model.js';
import { logger } from '../config/logger.js';

/**
 * Demo trading history.
 *
 * Rather than writing orders, transactions and holdings independently - which
 * drifts out of alignment the moment anyone edits one list - this REPLAYS a
 * sequence of trades through the same arithmetic the live engine uses:
 *
 *   fill -> fees -> transaction -> holding (weighted average cost) -> wallet
 *
 * So a holding's quantity is the sum of its fills, its average cost includes
 * capitalised buy fees, the wallet balance is the opening capital minus every
 * net amount, and each transaction points at the order that produced it. The
 * numbers on screen reconcile because they were derived, not invented.
 *
 * Idempotent: every order carries a deterministic `idempotencyKey`, and the
 * whole replay is skipped for an account that already has it.
 *
 * All amounts are minor units (paise / cents) and all of it is simulated.
 */

interface Leg {
  symbol: string;
  exchange: 'NSE' | 'BSE' | 'NASDAQ' | 'NYSE';
  side: 'BUY' | 'SELL';
  quantity: number;
  /**
   * Percent BELOW the current market price for a buy (so a positive number is
   * an unrealised gain), or ABOVE it for a sell.
   *
   * Derived rather than hardcoded on purpose: fixed prices go stale as the
   * live feed moves, and an earlier draft left NVDA showing a 63% loss because
   * its hardcoded cost was written against a price the market had long left
   * behind. A drift keeps every position plausible whatever the feed says.
   */
  drift: number;
  daysAgo: number;
}

/**
 * A believable few weeks of activity: mostly buys, a couple of exits.
 *
 * Sized to fit inside the opening capital of each wallet (Rs 10,00,000 and
 * $10,000) with cash to spare. An earlier draft overspent the USD wallet and
 * drove it negative - a state the live engine would never allow, because
 * reserveForBuy rejects the order first.
 */
const TRADER_LEGS: Leg[] = [
  { symbol: 'RELIANCE', exchange: 'NSE', side: 'BUY', quantity: 40, drift: 3.2, daysAgo: 42 },
  { symbol: 'TCS', exchange: 'NSE', side: 'BUY', quantity: 25, drift: 2.4, daysAgo: 40 },
  { symbol: 'HDFCBANK', exchange: 'NSE', side: 'BUY', quantity: 60, drift: 4.1, daysAgo: 37 },
  { symbol: 'INFY', exchange: 'NSE', side: 'BUY', quantity: 50, drift: -1.8, daysAgo: 33 },
  { symbol: 'AXISBANK', exchange: 'NSE', side: 'BUY', quantity: 45, drift: 5.6, daysAgo: 29 },
  { symbol: 'TATASTEEL', exchange: 'NSE', side: 'BUY', quantity: 150, drift: 6.3, daysAgo: 26 },
  { symbol: 'HCLTECH', exchange: 'NSE', side: 'BUY', quantity: 30, drift: 1.9, daysAgo: 22 },
  { symbol: 'ASIANPAINT', exchange: 'NSE', side: 'BUY', quantity: 12, drift: 2.8, daysAgo: 19 },
  { symbol: 'AAPL', exchange: 'NASDAQ', side: 'BUY', quantity: 6, drift: 2.1, daysAgo: 35 },
  { symbol: 'MSFT', exchange: 'NASDAQ', side: 'BUY', quantity: 4, drift: 3.4, daysAgo: 31 },
  { symbol: 'NVDA', exchange: 'NASDAQ', side: 'BUY', quantity: 3, drift: -2.6, daysAgo: 24 },
  { symbol: 'JPM', exchange: 'NYSE', side: 'BUY', quantity: 5, drift: 1.5, daysAgo: 18 },
  { symbol: 'TATASTEEL', exchange: 'NSE', side: 'SELL', quantity: 50, drift: -4.0, daysAgo: 9 },
  { symbol: 'AAPL', exchange: 'NASDAQ', side: 'SELL', quantity: 2, drift: -1.2, daysAgo: 6 },
  { symbol: 'RELIANCE', exchange: 'NSE', side: 'BUY', quantity: 20, drift: 0.6, daysAgo: 3 },
];

/** A lighter book for the admin, so their portfolio pages are not empty either. */
const ADMIN_LEGS: Leg[] = [
  { symbol: 'RELIANCE', exchange: 'NSE', side: 'BUY', quantity: 15, drift: 1.8, daysAgo: 21 },
  { symbol: 'INFY', exchange: 'NSE', side: 'BUY', quantity: 20, drift: -0.9, daysAgo: 17 },
  { symbol: 'BAJFINANCE', exchange: 'NSE', side: 'BUY', quantity: 10, drift: 3.5, daysAgo: 12 },
  { symbol: 'MSFT', exchange: 'NASDAQ', side: 'BUY', quantity: 5, drift: 2.2, daysAgo: 15 },
  { symbol: 'AMZN', exchange: 'NASDAQ', side: 'BUY', quantity: 6, drift: 4.4, daysAgo: 8 },
  { symbol: 'INFY', exchange: 'NSE', side: 'SELL', quantity: 8, drift: -1.5, daysAgo: 4 },
];

/** A small book for the super admin, whose sidebar also carries trading pages. */
const SUPER_LEGS: Leg[] = [
  { symbol: 'TCS', exchange: 'NSE', side: 'BUY', quantity: 8, drift: 1.2, daysAgo: 19 },
  { symbol: 'HDFCBANK', exchange: 'NSE', side: 'BUY', quantity: 25, drift: 2.9, daysAgo: 14 },
  { symbol: 'ASIANPAINT', exchange: 'NSE', side: 'BUY', quantity: 5, drift: 0.8, daysAgo: 10 },
  { symbol: 'AAPL', exchange: 'NASDAQ', side: 'BUY', quantity: 4, drift: 1.6, daysAgo: 13 },
  { symbol: 'NVDA', exchange: 'NASDAQ', side: 'BUY', quantity: 2, drift: -1.1, daysAgo: 7 },
  { symbol: 'TCS', exchange: 'NSE', side: 'SELL', quantity: 3, drift: -2.0, daysAgo: 3 },
];

/** Open and closed orders that never produced a fill. */
interface RestingOrder {
  symbol: string;
  exchange: 'NSE' | 'BSE' | 'NASDAQ' | 'NYSE';
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  /*
   * The engine's OrderStatus enum has five values and fills are all-or-nothing
   * (`filledQuantity = quantity`). There is no PARTIALLY_FILLED status, and
   * adding one would mean changing the matching engine. A part-filled order is
   * therefore a PENDING order with filledQuantity > 0, which is exactly how
   * the schema already models it.
   */
  status: 'PENDING' | 'CANCELLED' | 'REJECTED' | 'EXPIRED';
  quantity: number;
  filledQuantity: number;
  price: number;
  daysAgo: number;
  rejectReason?: string;
}

const TRADER_OPEN: RestingOrder[] = [
  { symbol: 'TCS', exchange: 'NSE', side: 'BUY', type: 'LIMIT', status: 'PENDING', quantity: 15, filledQuantity: 0, price: 1980.0, daysAgo: 2 },
  { symbol: 'HDFCBANK', exchange: 'NSE', side: 'SELL', type: 'LIMIT', status: 'PENDING', quantity: 20, filledQuantity: 0, price: 780.0, daysAgo: 1 },
  // Part-filled: still PENDING, with 4 of 10 already executed.
  { symbol: 'NVDA', exchange: 'NASDAQ', side: 'BUY', type: 'LIMIT', status: 'PENDING', quantity: 10, filledQuantity: 4, price: 600.0, daysAgo: 5 },
  { symbol: 'INFY', exchange: 'NSE', side: 'BUY', type: 'LIMIT', status: 'CANCELLED', quantity: 25, filledQuantity: 0, price: 940.0, daysAgo: 11 },
  { symbol: 'ASIANPAINT', exchange: 'NSE', side: 'BUY', type: 'MARKET', status: 'REJECTED', quantity: 500, filledQuantity: 0, price: 2400.0, daysAgo: 14, rejectReason: 'Insufficient funds in this wallet for the order and its charges.' },
  { symbol: 'TATASTEEL', exchange: 'NSE', side: 'BUY', type: 'LIMIT', status: 'EXPIRED', quantity: 100, filledQuantity: 0, price: 150.0, daysAgo: 16 },
];

const SUPER_OPEN: RestingOrder[] = [
  { symbol: 'INFY', exchange: 'NSE', side: 'BUY', type: 'LIMIT', status: 'PENDING', quantity: 12, filledQuantity: 0, price: 960.0, daysAgo: 3 },
  { symbol: 'AAPL', exchange: 'NASDAQ', side: 'SELL', type: 'LIMIT', status: 'EXPIRED', quantity: 2, filledQuantity: 0, price: 400.0, daysAgo: 9 },
];

const ADMIN_OPEN: RestingOrder[] = [
  { symbol: 'RELIANCE', exchange: 'NSE', side: 'BUY', type: 'LIMIT', status: 'PENDING', quantity: 10, filledQuantity: 0, price: 1190.0, daysAgo: 2 },
  { symbol: 'AMZN', exchange: 'NASDAQ', side: 'SELL', type: 'LIMIT', status: 'CANCELLED', quantity: 3, filledQuantity: 0, price: 260.0, daysAgo: 6 },
];

const toMinor = (major: number): number => Math.round(major * 100);
const at = (daysAgo: number): Date => new Date(Date.now() - daysAgo * 86_400_000);

interface Ctx {
  userId: mongoose.Types.ObjectId;
  portfolios: Map<'IN' | 'US', { id: mongoose.Types.ObjectId; cash: number }>;
}

/** Replays one filled leg: order -> fees -> transaction -> holding -> wallet. */
async function replayLeg(ctx: Ctx, leg: Leg, index: number, tag: string): Promise<void> {
  const instrument = await Instrument.findOne({ symbol: leg.symbol, exchange: leg.exchange });
  if (!instrument) return;

  const market = instrument.market;
  const wallet = ctx.portfolios.get(market);
  if (!wallet) return;

  // Priced off the live quote, so every position stays plausible as the feed
  // moves. Falls back to the drift-free price if no quote is available.
  const quote = await getQuote(instrument).catch(() => null);
  const base = quote?.ltp ?? 100_000;
  const price = Math.max(1, Math.round(base * (1 - leg.drift / 100)));
  const turnover = price * leg.quantity;
  const fees = calculateFees({ market, side: leg.side, turnover, quantity: leg.quantity });
  const net = leg.side === 'BUY' ? buyCost(turnover, fees) : sellProceeds(turnover, fees);
  const when = at(leg.daysAgo);

  const idempotencyKey = `demo-seed:${tag}:${String(index)}`;
  if (await Order.findOne({ userId: ctx.userId, idempotencyKey })) return;

  const holding = await Holding.findOne({
    portfolioId: wallet.id,
    instrumentId: instrument._id,
  });

  let realisedPnl: number | null = null;

  if (leg.side === 'BUY') {
    // Weighted average cost WITH buy fees capitalised, matching the engine.
    const priorQty = holding?.quantity ?? 0;
    const priorInvested = holding?.investedAmount ?? 0;
    const newQty = priorQty + leg.quantity;
    const newInvested = priorInvested + net;

    await Holding.updateOne(
      { portfolioId: wallet.id, instrumentId: instrument._id },
      {
        $set: {
          quantity: newQty,
          investedAmount: newInvested,
          averageCost: Math.round(newInvested / newQty),
          symbol: instrument.symbol,
          exchange: instrument.exchange,
          instrumentName: instrument.name,
          userId: ctx.userId,
        },
        $setOnInsert: { blockedQuantity: 0, realisedPnl: 0, createdAt: when },
      },
      { upsert: true },
    );
    wallet.cash -= net;
  } else {
    // Selling never changes average cost; it realises against it.
    const avg = holding?.averageCost ?? price;
    realisedPnl = net - avg * leg.quantity;
    const remaining = Math.max(0, (holding?.quantity ?? 0) - leg.quantity);

    await Holding.updateOne(
      { portfolioId: wallet.id, instrumentId: instrument._id },
      {
        $set: {
          quantity: remaining,
          investedAmount: avg * remaining,
          averageCost: remaining === 0 ? 0 : avg,
        },
        $inc: { realisedPnl },
      },
    );
    wallet.cash += net;
  }

  const order = await Order.create({
    userId: ctx.userId,
    portfolioId: wallet.id,
    instrumentId: instrument._id,
    symbol: instrument.symbol,
    exchange: instrument.exchange,
    instrumentName: instrument.name,
    market,
    currency: instrument.currency,
    side: leg.side,
    type: 'MARKET',
    status: 'FILLED',
    validity: 'DAY',
    quantity: leg.quantity,
    filledQuantity: leg.quantity,
    limitPrice: null,
    averageFillPrice: price,
    grossAmount: turnover,
    fees,
    netAmount: net,
    reservedCash: 0,
    reservedQuantity: 0,
    rejectReason: null,
    queuedForNextOpen: false,
    idempotencyKey,
    createdAt: when,
    updatedAt: when,
  });

  await Transaction.create({
    userId: ctx.userId,
    portfolioId: wallet.id,
    orderId: order._id,
    instrumentId: instrument._id,
    type: leg.side,
    symbol: instrument.symbol,
    exchange: instrument.exchange,
    instrumentName: instrument.name,
    market,
    currency: instrument.currency,
    quantity: leg.quantity,
    price,
    grossAmount: turnover,
    fees,
    netAmount: net,
    cashAfter: wallet.cash,
    realisedPnl,
    createdAt: when,
  });
}

/** Orders that never filled: no transaction, no holding, no cash movement. */
async function createRestingOrder(
  ctx: Ctx,
  spec: RestingOrder,
  index: number,
  tag: string,
): Promise<void> {
  const instrument = await Instrument.findOne({ symbol: spec.symbol, exchange: spec.exchange });
  if (!instrument) return;

  const market = instrument.market;
  const wallet = ctx.portfolios.get(market);
  if (!wallet) return;

  const idempotencyKey = `demo-seed:${tag}:open:${String(index)}`;
  if (await Order.findOne({ userId: ctx.userId, idempotencyKey })) return;

  const price = toMinor(spec.price);
  const filled = spec.filledQuantity;
  const when = at(spec.daysAgo);
  const turnover = filled > 0 ? price * filled : null;
  const fees =
    turnover !== null
      ? calculateFees({ market, side: spec.side, turnover, quantity: filled })
      : null;

  await Order.create({
    userId: ctx.userId,
    portfolioId: wallet.id,
    instrumentId: instrument._id,
    symbol: instrument.symbol,
    exchange: instrument.exchange,
    instrumentName: instrument.name,
    market,
    currency: instrument.currency,
    side: spec.side,
    type: spec.type,
    status: spec.status,
    validity: 'DAY',
    quantity: spec.quantity,
    filledQuantity: filled,
    limitPrice: spec.type === 'LIMIT' ? price : null,
    averageFillPrice: filled > 0 ? price : null,
    grossAmount: turnover,
    fees,
    netAmount: turnover !== null && fees !== null ? buyCost(turnover, fees) : null,
    reservedCash: 0,
    reservedQuantity: 0,
    rejectReason: spec.rejectReason ?? null,
    queuedForNextOpen: false,
    idempotencyKey,
    createdAt: when,
    updatedAt: when,
  });
}

// ------------------------------------------------------------------- alerts

const ALERTS: {
  symbol: string;
  exchange: 'NSE' | 'NASDAQ';
  condition: 'PRICE_ABOVE' | 'PRICE_BELOW';
  threshold: number;
  status: 'ACTIVE' | 'TRIGGERED';
  daysAgo: number;
  note: string;
}[] = [
  { symbol: 'RELIANCE', exchange: 'NSE', condition: 'PRICE_ABOVE', threshold: 1300, status: 'ACTIVE', daysAgo: 12, note: 'Take partial profit above 1300.' },
  { symbol: 'TCS', exchange: 'NSE', condition: 'PRICE_BELOW', threshold: 2000, status: 'ACTIVE', daysAgo: 10, note: 'Add on a dip below 2000.' },
  { symbol: 'HDFCBANK', exchange: 'NSE', condition: 'PRICE_ABOVE', threshold: 800, status: 'ACTIVE', daysAgo: 9, note: 'Watch the breakout level.' },
  { symbol: 'INFY', exchange: 'NSE', condition: 'PRICE_BELOW', threshold: 950, status: 'TRIGGERED', daysAgo: 20, note: 'Support retest.' },
  { symbol: 'AXISBANK', exchange: 'NSE', condition: 'PRICE_ABOVE', threshold: 1250, status: 'ACTIVE', daysAgo: 7, note: '' },
  { symbol: 'TATASTEEL', exchange: 'NSE', condition: 'PRICE_ABOVE', threshold: 200, status: 'ACTIVE', daysAgo: 6, note: 'Momentum continuation.' },
  { symbol: 'AAPL', exchange: 'NASDAQ', condition: 'PRICE_BELOW', threshold: 320, status: 'ACTIVE', daysAgo: 5, note: 'Reload zone.' },
  { symbol: 'NVDA', exchange: 'NASDAQ', condition: 'PRICE_ABOVE', threshold: 650, status: 'TRIGGERED', daysAgo: 15, note: 'Earnings run-up.' },
  { symbol: 'MSFT', exchange: 'NASDAQ', condition: 'PRICE_BELOW', threshold: 380, status: 'ACTIVE', daysAgo: 4, note: '' },
];

async function seedAlerts(userId: mongoose.Types.ObjectId): Promise<number> {
  for (const spec of ALERTS) {
    const instrument = await Instrument.findOne({ symbol: spec.symbol, exchange: spec.exchange });
    if (!instrument) continue;

    const when = at(spec.daysAgo);
    await Alert.updateOne(
      { userId, instrumentId: instrument._id, condition: spec.condition },
      {
        $setOnInsert: {
          userId,
          instrumentId: instrument._id,
          symbol: instrument.symbol,
          exchange: instrument.exchange,
          instrumentName: instrument.name,
          condition: spec.condition,
          threshold: toMinor(spec.threshold),
          status: spec.status,
          repeat: false,
          note: spec.note || null,
          triggeredAt: spec.status === 'TRIGGERED' ? at(spec.daysAgo - 2) : null,
          triggeredPrice: spec.status === 'TRIGGERED' ? toMinor(spec.threshold) : null,
          lastCheckedAt: new Date(Date.now() - 120_000),
          cooldownUntil: null,
          createdAt: when,
          updatedAt: when,
        },
      },
      { upsert: true, timestamps: false },
    );
  }
  return Alert.countDocuments({ userId });
}

// ------------------------------------------------------------ notifications

/** Built from the trades above, so every reference points at real activity. */
function buildNotifications(): {
  type: 'ORDER_FILLED' | 'ORDER_REJECTED' | 'ORDER_CANCELLED' | 'ORDER_EXPIRED' | 'ALERT_TRIGGERED' | 'ACCOUNT' | 'SYSTEM';
  title: string;
  body: string;
  hoursAgo: number;
}[] {
  const out: ReturnType<typeof buildNotifications> = [];

  for (const [i, leg] of TRADER_LEGS.entries()) {
    out.push({
      type: 'ORDER_FILLED',
      title: `${leg.side} order filled: ${leg.symbol}`,
      body: `${String(leg.quantity)} ${leg.symbol} ${leg.side === 'BUY' ? 'bought' : 'sold'} on ${leg.exchange}. Simulated fill.`,
      hoursAgo: leg.daysAgo * 24 + i,
    });
  }

  for (const [i, spec] of TRADER_OPEN.entries()) {
    const map = {
      PENDING: 'SYSTEM',
      CANCELLED: 'ORDER_CANCELLED',
      REJECTED: 'ORDER_REJECTED',
      EXPIRED: 'ORDER_EXPIRED',
    } as const;
    out.push({
      type: map[spec.status],
      title:
        spec.filledQuantity > 0 && spec.status === 'PENDING'
          ? `Order partially filled: ${spec.symbol}`
          : `Order ${spec.status.toLowerCase()}: ${spec.symbol}`,
      body:
        spec.rejectReason ??
        (spec.filledQuantity > 0
          ? `${String(spec.filledQuantity)} of ${String(spec.quantity)} ${spec.symbol} filled so far; the rest is still working.`
          : `${spec.side} ${String(spec.quantity)} ${spec.symbol} (${spec.type}) is ${spec.status.toLowerCase()}.`),
      hoursAgo: spec.daysAgo * 24 + i,
    });
  }

  for (const [i, a] of ALERTS.entries()) {
    out.push({
      type: a.status === 'TRIGGERED' ? 'ALERT_TRIGGERED' : 'SYSTEM',
      title:
        a.status === 'TRIGGERED'
          ? `Price alert triggered: ${a.symbol}`
          : `Price alert set: ${a.symbol}`,
      body: `${a.symbol} ${a.condition === 'PRICE_ABOVE' ? 'above' : 'below'} ${a.threshold}. ${a.note}`.trim(),
      hoursAgo: a.daysAgo * 24 + i,
    });
  }

  const market = [
    ['NSE and BSE are now open', 'Indian markets opened for the session.'],
    ['NSE and BSE have closed', 'Orders placed now queue for the next session.'],
    ['US markets are now open', 'NASDAQ and NYSE opened for the session.'],
    ['US markets have closed', 'After-hours orders will queue.'],
    ['NIFTY 50 moved more than 1%', 'The index closed down 1.35% on broad weakness.'],
    ['SENSEX update', 'SENSEX ended lower, dragged by IT and banking.'],
    ['Top gainer today', 'AXISBANK led the gainers, up 2.98%.'],
    ['Top loser today', 'INFY was among the biggest losers, down 1.76%.'],
    ['Watchlist movement', 'RELIANCE moved more than 3% during the session.'],
    ['Watchlist update', 'TCS crossed its 20-day average.'],
    ['Sector note', 'Metals outperformed on restocking demand.'],
    ['Sector note', 'IT lagged ahead of results season.'],
    ['Portfolio update', 'Your portfolio value changed by more than 1% today.'],
    ['Portfolio update', 'Unrealised P&L improved on your Indian holdings.'],
    ['Weekly summary', 'You placed 4 orders this week across 2 markets.'],
    ['Monthly summary', 'Realised P&L for the month is positive on a simulated basis.'],
    ['New education resource', '"Reading Candlestick Charts" is now available.'],
    ['New education resource', '"Risk Management Basics" has been published.'],
    ['Education reminder', 'You have unread resources in the learning library.'],
    ['Market news', 'Reliance outlined its capital expenditure guidance.'],
    ['Market news', 'IT margin commentary turned cautious ahead of results.'],
    ['Market news', 'Rate-path expectations repriced after a softer inflation print.'],
    ['System maintenance', 'A brief maintenance window is scheduled overnight.'],
    ['System notice', 'Market data is delayed or simulated, never live.'],
    ['System notice', 'Background order matching ran normally.'],
    ['Security', 'A new sign-in was recorded on your account.'],
    ['Security', 'Your session was refreshed successfully.'],
    ['Security', 'Password unchanged for 90 days - consider rotating it.'],
    ['Account', 'Your demo wallets were topped up to their opening capital.'],
    ['Account', 'Both INR and USD wallets are active and segregated.'],
    ['Trading activity', 'No orders were placed yesterday.'],
    ['Trading activity', 'Your fill rate this month is 78%.'],
    ['Trading activity', 'Average holding period is 21 days.'],
    ['Reminder', 'All trading here is simulated - no real money is involved.'],
    ['Reminder', 'Nothing on this platform is investment advice.'],
    ['Market news', 'Banking credit growth held steady; deposit costs still climbing.'],
    ['Market news', 'Semiconductor demand diverged between data centre and consumer.'],
    ['Market news', 'US mega-cap earnings beat on cloud revenue.'],
    ['Market update', 'NIFTY Bank closed lower after an early rally faded.'],
    ['Market update', 'NASDAQ Composite finished marginally higher.'],
    ['Watchlist update', 'HDFCBANK is approaching its 52-week high.'],
    ['Watchlist update', 'AXISBANK was the strongest name on your list today.'],
    ['Education reminder', 'Finish "Portfolio Basics" to complete the beginner track.'],
    ['New education resource', '"Fundamental Analysis" has been added to the library.'],
    ['Education', 'Paper trading lets you test an idea before risking capital.'],
    ['System notice', 'Quote cache refreshed; prices remain delayed or simulated.'],
    ['System notice', 'Scheduled data sync completed without errors.'],
  ] as const;

  for (const [i, [title, body]] of market.entries()) {
    const type: 'SYSTEM' | 'ACCOUNT' = title.startsWith('Security') || title.startsWith('Account') ? 'ACCOUNT' : 'SYSTEM';
    out.push({ type, title, body, hoursAgo: 2 + i * 7 });
  }

  return out;
}

async function seedNotifications(
  userId: mongoose.Types.ObjectId,
  filter?: (item: ReturnType<typeof buildNotifications>[number]) => boolean,
): Promise<number> {
  const items = filter ? buildNotifications().filter(filter) : buildNotifications();

  for (const item of items) {
    const createdAt = new Date(Date.now() - item.hoursAgo * 3_600_000);
    await Notification.updateOne(
      // Title alone is not unique (several share one), so the timestamp is
      // part of the key - and it is derived from a fixed offset, not Date.now
      // at write time, so re-running does not duplicate.
      { userId, title: item.title, body: item.body },
      {
        $setOnInsert: {
          userId,
          type: item.type,
          title: item.title,
          body: item.body,
          data: {},
          // Anything older than two days is treated as already seen, which
          // leaves a believable unread count rather than 60 bold rows.
          readAt: item.hoursAgo > 48 ? createdAt : null,
          createdAt,
        },
      },
      { upsert: true, timestamps: false },
    );
  }

  return Notification.countDocuments({ userId });
}

// ------------------------------------------------------------------- runner

async function loadContext(email: string): Promise<Ctx | null> {
  const user = await User.findOne({ email }).lean();
  if (!user) return null;

  const wallets = await Portfolio.find({ userId: user._id });
  const portfolios = new Map<'IN' | 'US', { id: mongoose.Types.ObjectId; cash: number }>();
  for (const wallet of wallets) {
    portfolios.set(wallet.market, {
      id: wallet._id,
      cash: wallet.cashAvailable,
    });
  }

  return { userId: user._id, portfolios };
}

async function runFor(email: string, legs: Leg[], open: RestingOrder[], tag: string): Promise<void> {
  const ctx = await loadContext(email);
  if (!ctx) return;

  // Already replayed: the first key exists, so skip the whole sequence rather
  // than re-deriving wallet balances from a moved starting point.
  if (await Order.findOne({ userId: ctx.userId, idempotencyKey: `demo-seed:${tag}:0` })) {
    logger.info({ email }, '  trading history already present, skipped');
    return;
  }

  for (const [index, leg] of legs.entries()) {
    await replayLeg(ctx, leg, index, tag);
  }
  for (const [index, spec] of open.entries()) {
    await createRestingOrder(ctx, spec, index, tag);
  }

  // Persist the wallet balances the replay produced.
  for (const [, wallet] of ctx.portfolios) {
    await Portfolio.updateOne({ _id: wallet.id }, { $set: { cashAvailable: wallet.cash } });
  }

  const orders = await Order.countDocuments({ userId: ctx.userId });
  const holdings = await Holding.countDocuments({ userId: ctx.userId });
  const txns = await Transaction.countDocuments({ userId: ctx.userId });
  logger.info({ email, orders, holdings, transactions: txns }, '  trading history ready');
}

export async function seedDemoTrading(): Promise<void> {
  await runFor('demo.trader@smd.local', TRADER_LEGS, TRADER_OPEN, 'trader');
  await runFor('demo.admin@smd.local', ADMIN_LEGS, ADMIN_OPEN, 'admin');
  await runFor('demo.superadmin@smd.local', SUPER_LEGS, SUPER_OPEN, 'superadmin');

  for (const email of [
    'demo.trader@smd.local',
    'demo.admin@smd.local',
    'demo.superadmin@smd.local',
  ]) {
    const user = await User.findOne({ email }).lean();
    if (!user) continue;
    const alerts = await seedAlerts(user._id);
    const notes = await seedNotifications(user._id);
    logger.info({ email, alerts, notifications: notes }, '  alerts and notifications ready');
  }

  /*
   * The view-only User gets the market, education and system notifications but
   * NOT the order or alert ones - it cannot trade, so a feed full of fills
   * would be fiction. No alerts either, for the same reason.
   */
  const viewer = await User.findOne({ email: 'demo.user@smd.local' }).lean();
  if (viewer) {
    const notes = await seedNotifications(
      viewer._id,
      (item) =>
        ['SYSTEM', 'ACCOUNT'].includes(item.type) && !item.title.startsWith('Price alert'),
    );
    logger.info({ notifications: notes }, '  view-only user notifications ready');
  }
}

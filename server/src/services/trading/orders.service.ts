import type { ClientSession, Types } from 'mongoose';
import {
  ERROR_CODES,
  GTC_VALIDITY_DAYS,
  toMinor,
  weightedAverage,
  type FeeBreakdown,
  type Order as OrderDto,
  type OrderPreview,
  type PlaceOrderInput,
} from '@smd/shared';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../config/logger.js';
import { withTransaction } from '../../lib/transaction.js';
import { Order, Transaction, type OrderDocument } from '../../modules/orders/order.model.js';
import {
  Holding,
  Portfolio,
  type PortfolioDocument,
} from '../../modules/portfolios/portfolio.model.js';
import type { InstrumentDocument } from '../../modules/instruments/instrument.model.js';
import { findInstrument, getQuote, isQuoteFresh } from '../market/marketData.service.js';
import { getMarketStatus, sessionCloseInstant } from '../market/marketHours.js';
import { getSystemConfig } from '../../modules/admin/config.service.js';
import { buyCost, calculateFees, reserveForBuy, sellProceeds } from './fees.js';

/**
 * The trading engine.
 *
 * Invariants it exists to hold:
 *  - Cash and holdings are never negative.
 *  - Reserved funds/shares always match the set of open orders.
 *  - Every fill writes exactly one immutable ledger row.
 *  - A double-submitted order becomes one order, not two.
 */

export function toOrderDto(order: OrderDocument): OrderDto {
  return {
    id: order._id.toString(),
    symbol: order.symbol,
    exchange: order.exchange,
    instrumentName: order.instrumentName,
    currency: order.currency,
    market: order.market,
    side: order.side,
    type: order.type,
    status: order.status,
    validity: order.validity,
    quantity: order.quantity,
    filledQuantity: order.filledQuantity,
    limitPrice: order.limitPrice,
    averageFillPrice: order.averageFillPrice,
    grossAmount: order.grossAmount,
    fees: order.fees,
    netAmount: order.netAmount,
    rejectReason: order.rejectReason,
    placedAt: order.placedAt.toISOString(),
    executedAt: order.executedAt?.toISOString() ?? null,
    expiresAt: order.expiresAt?.toISOString() ?? null,
    queuedForNextOpen: order.queuedForNextOpen,
  };
}

interface ResolvedOrderContext {
  instrument: InstrumentDocument;
  portfolio: PortfolioDocument;
  /** Reference price in minor units: the limit, or the live quote. */
  price: number;
  marketOpen: boolean;
  quoteIsFresh: boolean;
}

/**
 * Resolves and validates everything an order depends on, before any write.
 *
 * Shared by preview and placement so the number the user is shown is produced
 * by exactly the same code that later charges them.
 */
async function resolveContext(
  userId: Types.ObjectId,
  input: PlaceOrderInput,
): Promise<ResolvedOrderContext> {
  const instrument = await findInstrument(input.symbol, input.exchange);
  if (!instrument) {
    throw ApiError.notFound(`No instrument found for '${input.symbol}' on ${input.exchange}.`);
  }
  if (!instrument.isActive) {
    throw new ApiError(
      409,
      ERROR_CODES.INSTRUMENT_INACTIVE,
      `${instrument.symbol} is not currently tradable on this platform.`,
    );
  }

  const portfolio = await Portfolio.findOne({ userId, market: instrument.market });
  if (!portfolio) {
    throw ApiError.notFound(
      `You do not have a ${instrument.market === 'IN' ? 'INR' : 'USD'} wallet yet.`,
    );
  }

  // The segregated-wallet rule, enforced at the engine rather than trusted from
  // the client: INR cash may only ever buy Indian stock, and USD only US.
  if (portfolio.currency !== instrument.currency) {
    throw new ApiError(
      409,
      ERROR_CODES.CURRENCY_MISMATCH,
      `${instrument.symbol} trades in ${instrument.currency}, which cannot be bought with your ${portfolio.currency} wallet.`,
    );
  }

  const quote = await getQuote(instrument);
  const marketOpen = getMarketStatus(instrument.market).isOpen;
  const quoteIsFresh = isQuoteFresh(quote);

  const price = input.type === 'LIMIT' && input.limitPrice ? toMinor(input.limitPrice) : quote.ltp;

  return { instrument, portfolio, price, marketOpen, quoteIsFresh };
}

// -------------------------------------------------------------------- preview

/** Costs the order without writing anything. Drives the order form. */
export async function previewOrder(
  userId: Types.ObjectId,
  input: PlaceOrderInput,
): Promise<OrderPreview> {
  const context = await resolveContext(userId, input);
  const { instrument, portfolio, price, marketOpen } = context;

  const turnover = price * input.quantity;
  const fees = calculateFees({
    market: instrument.market,
    side: input.side,
    turnover,
    quantity: input.quantity,
  });

  const netAmount = input.side === 'BUY' ? buyCost(turnover, fees) : sellProceeds(turnover, fees);

  const warnings: string[] = [];
  let canAfford: boolean;

  if (input.side === 'BUY') {
    canAfford = portfolio.cashAvailable >= netAmount;
    if (!canAfford) {
      warnings.push('Insufficient funds in this wallet for the order and its charges.');
    }
  } else {
    const holding = await Holding.findOne({
      portfolioId: portfolio._id,
      instrumentId: instrument._id,
    });
    const sellable = (holding?.quantity ?? 0) - (holding?.blockedQuantity ?? 0);
    canAfford = sellable >= input.quantity;
    if (!canAfford) {
      warnings.push(`You hold ${sellable} sellable share(s) of ${instrument.symbol}.`);
    }
  }

  if (!marketOpen) {
    warnings.push(
      input.queueIfClosed
        ? 'The market is closed. This order will be queued for the next session.'
        : 'The market is closed. Enable "queue for next open" to place this order now.',
    );
  }

  if (!context.quoteIsFresh) {
    warnings.push('The latest quote is stale. Market orders are rejected against stale prices.');
  }

  return {
    symbol: instrument.symbol,
    side: input.side,
    type: input.type,
    quantity: input.quantity,
    estimatedPrice: price,
    grossAmount: turnover,
    fees,
    netAmount,
    currency: instrument.currency,
    cashAvailable: portfolio.cashAvailable,
    canAfford,
    marketOpen,
    warnings,
  };
}

// ------------------------------------------------------------------ placement

export interface PlaceOrderOptions {
  idempotencyKey?: string;
}

export async function placeOrder(
  userId: Types.ObjectId,
  input: PlaceOrderInput,
  options: PlaceOrderOptions = {},
): Promise<{ order: OrderDto; duplicate: boolean }> {
  const config = await getSystemConfig();
  if (!config.tradingEnabled) {
    throw new ApiError(
      403,
      ERROR_CODES.TRADING_DISABLED,
      'Trading is temporarily disabled by an administrator.',
    );
  }

  // Idempotency short-circuit. The unique index is the real guarantee; this
  // check just returns the original order instead of a 409 on an honest retry.
  if (options.idempotencyKey) {
    const existing = await Order.findOne({ userId, idempotencyKey: options.idempotencyKey });
    if (existing) return { order: toOrderDto(existing), duplicate: true };
  }

  const context = await resolveContext(userId, input);
  const { instrument, price, marketOpen, quoteIsFresh } = context;

  if (!marketOpen && !input.queueIfClosed) {
    const status = getMarketStatus(instrument.market);
    throw new ApiError(
      409,
      ERROR_CODES.MARKET_CLOSED,
      `The ${instrument.market === 'IN' ? 'Indian' : 'US'} market is closed (${status.reason}). ` +
        'Re-submit with "queue for next open" to place this order now.',
    );
  }

  // A market order is a promise to trade at the current price. If that price is
  // 15+ minutes old, there is no honest "current price" to fill against.
  if (input.type === 'MARKET' && !quoteIsFresh) {
    throw new ApiError(
      409,
      ERROR_CODES.STALE_QUOTE,
      'The latest quote is too old to execute a market order. Try a limit order instead.',
    );
  }

  const shouldExecuteNow = input.type === 'MARKET' && marketOpen && quoteIsFresh;

  try {
    return await withTransaction(async (session) => {
      const order = await createOrderDocument(userId, input, context, options, session);

      if (shouldExecuteNow) {
        const executed = await executeOrder(order, price, session);
        return { order: toOrderDto(executed), duplicate: false };
      }

      await reserveFunds(order, context, session);
      return { order: toOrderDto(order), duplicate: false };
    });
  } catch (error) {
    // The unique index fired: two identical submissions raced. Return the one
    // that won rather than surfacing a database error.
    if (isDuplicateKeyError(error) && options.idempotencyKey) {
      const winner = await Order.findOne({ userId, idempotencyKey: options.idempotencyKey });
      if (winner) return { order: toOrderDto(winner), duplicate: true };
      throw new ApiError(409, ERROR_CODES.DUPLICATE_ORDER, 'This order was already submitted.');
    }
    throw error;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 11000;
}

async function createOrderDocument(
  userId: Types.ObjectId,
  input: PlaceOrderInput,
  context: ResolvedOrderContext,
  options: PlaceOrderOptions,
  session: ClientSession | undefined,
): Promise<OrderDocument> {
  const { instrument, portfolio, marketOpen } = context;

  const expiresAt =
    input.validity === 'GTC'
      ? new Date(Date.now() + GTC_VALIDITY_DAYS * 24 * 60 * 60 * 1000)
      : sessionCloseInstant(instrument.market);

  const [order] = await Order.create(
    [
      {
        userId,
        portfolioId: portfolio._id,
        instrumentId: instrument._id,
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        instrumentName: instrument.name,
        market: instrument.market,
        currency: instrument.currency,
        side: input.side,
        type: input.type,
        status: 'PENDING',
        validity: input.validity,
        quantity: input.quantity,
        filledQuantity: 0,
        limitPrice: input.limitPrice ? toMinor(input.limitPrice) : null,
        queuedForNextOpen: !marketOpen,
        idempotencyKey: options.idempotencyKey ?? null,
        placedAt: new Date(),
        expiresAt,
      },
    ],
    session ? { session } : {},
  );

  if (!order) throw ApiError.internal('Order could not be created.');
  return order;
}

/**
 * Reserves cash (BUY) or shares (SELL) for an order that will rest.
 *
 * Without this, a user could place ten limit orders each spending their whole
 * balance and have all ten fill.
 */
async function reserveFunds(
  order: OrderDocument,
  context: ResolvedOrderContext,
  session: ClientSession | undefined,
): Promise<void> {
  const { portfolio, instrument, price } = context;
  const sessionOption = session ? { session } : {};

  if (order.side === 'BUY') {
    const required = reserveForBuy(price * order.quantity, instrument.market, order.quantity);

    // Conditional update: the filter re-checks the balance, so two concurrent
    // orders cannot both pass a stale read and overdraw the wallet.
    const result = await Portfolio.updateOne(
      { _id: portfolio._id, cashAvailable: { $gte: required } },
      { $inc: { cashAvailable: -required, cashBlocked: required } },
      sessionOption,
    );

    if (result.modifiedCount === 0) {
      throw new ApiError(
        409,
        ERROR_CODES.INSUFFICIENT_FUNDS,
        'Insufficient funds in this wallet for the order and its charges.',
      );
    }

    order.reservedCash = required;
    await order.save(sessionOption);
    return;
  }

  const result = await Holding.updateOne(
    {
      portfolioId: portfolio._id,
      instrumentId: instrument._id,
      $expr: { $gte: [{ $subtract: ['$quantity', '$blockedQuantity'] }, order.quantity] },
    },
    { $inc: { blockedQuantity: order.quantity } },
    sessionOption,
  );

  if (result.modifiedCount === 0) {
    throw new ApiError(
      409,
      ERROR_CODES.INSUFFICIENT_HOLDINGS,
      `You do not hold enough sellable shares of ${order.symbol} for this order.`,
    );
  }

  order.reservedQuantity = order.quantity;
  await order.save(sessionOption);
}

// ------------------------------------------------------------------ execution

/**
 * Fills an order at `fillPrice` and writes every consequence atomically:
 * wallet, holding, order and ledger row.
 *
 * Callers must already hold a transaction session where one is available.
 */
export async function executeOrder(
  order: OrderDocument,
  fillPrice: number,
  session: ClientSession | undefined,
): Promise<OrderDocument> {
  const sessionOption = session ? { session } : {};

  const turnover = fillPrice * order.quantity;
  const fees = calculateFees({
    market: order.market,
    side: order.side,
    turnover,
    quantity: order.quantity,
  });

  const portfolio = await Portfolio.findById(order.portfolioId, null, sessionOption);
  if (!portfolio) throw ApiError.internal('Wallet not found while executing an order.');

  let realisedPnl: number | null = null;

  if (order.side === 'BUY') {
    await applyBuy(order, portfolio, turnover, fees, fillPrice, session);
  } else {
    realisedPnl = await applySell(order, portfolio, turnover, fees, fillPrice, session);
  }

  order.status = 'FILLED';
  order.filledQuantity = order.quantity;
  order.averageFillPrice = fillPrice;
  order.grossAmount = turnover;
  order.fees = fees;
  order.netAmount = order.side === 'BUY' ? buyCost(turnover, fees) : sellProceeds(turnover, fees);
  order.executedAt = new Date();
  order.reservedCash = 0;
  order.reservedQuantity = 0;
  await order.save(sessionOption);

  const refreshed = await Portfolio.findById(order.portfolioId, null, sessionOption);

  await Transaction.create(
    [
      {
        userId: order.userId,
        portfolioId: order.portfolioId,
        orderId: order._id,
        instrumentId: order.instrumentId,
        type: order.side,
        symbol: order.symbol,
        exchange: order.exchange,
        instrumentName: order.instrumentName,
        market: order.market,
        currency: order.currency,
        quantity: order.quantity,
        price: fillPrice,
        grossAmount: turnover,
        fees,
        netAmount: order.netAmount,
        cashAfter: refreshed?.cashAvailable ?? 0,
        realisedPnl,
      },
    ],
    sessionOption,
  );

  return order;
}

async function applyBuy(
  order: OrderDocument,
  portfolio: PortfolioDocument,
  turnover: number,
  fees: FeeBreakdown,
  fillPrice: number,
  session: ClientSession | undefined,
): Promise<void> {
  const sessionOption = session ? { session } : {};
  const cost = buyCost(turnover, fees);

  if (order.reservedCash > 0) {
    // Release the reservation and charge the actual cost. A limit order fills
    // at or below its limit, so the refund is normally positive.
    const refund = order.reservedCash - cost;
    const update = await Portfolio.updateOne(
      { _id: portfolio._id },
      {
        $inc: {
          cashBlocked: -order.reservedCash,
          cashAvailable: refund,
          totalFeesPaid: fees.total,
        },
      },
      sessionOption,
    );
    if (update.modifiedCount === 0) throw ApiError.internal('Failed to settle reserved funds.');
  } else {
    // Immediate market order: debit directly, re-checking the balance in the
    // filter so a concurrent order cannot overdraw.
    const update = await Portfolio.updateOne(
      { _id: portfolio._id, cashAvailable: { $gte: cost } },
      { $inc: { cashAvailable: -cost, totalFeesPaid: fees.total } },
      sessionOption,
    );
    if (update.modifiedCount === 0) {
      throw new ApiError(
        409,
        ERROR_CODES.INSUFFICIENT_FUNDS,
        'Insufficient funds in this wallet for the order and its charges.',
      );
    }
  }

  const holding = await Holding.findOne(
    { portfolioId: portfolio._id, instrumentId: order.instrumentId },
    null,
    sessionOption,
  );

  if (holding) {
    // Weighted average cost, with buy fees capitalised into the basis. Selling
    // never changes this number - only buying does.
    const newQuantity = holding.quantity + order.quantity;
    const newInvested = holding.investedAmount + cost;
    holding.quantity = newQuantity;
    holding.investedAmount = newInvested;
    holding.averageCost = weightedAverage(newInvested, newQuantity);
    await holding.save(sessionOption);
  } else {
    await Holding.create(
      [
        {
          portfolioId: portfolio._id,
          userId: order.userId,
          instrumentId: order.instrumentId,
          symbol: order.symbol,
          exchange: order.exchange,
          instrumentName: order.instrumentName,
          quantity: order.quantity,
          blockedQuantity: 0,
          averageCost: weightedAverage(cost, order.quantity),
          investedAmount: cost,
          realisedPnl: 0,
        },
      ],
      sessionOption,
    );
  }

  void fillPrice;
}

async function applySell(
  order: OrderDocument,
  portfolio: PortfolioDocument,
  turnover: number,
  fees: FeeBreakdown,
  fillPrice: number,
  session: ClientSession | undefined,
): Promise<number> {
  const sessionOption = session ? { session } : {};

  const holding = await Holding.findOne(
    { portfolioId: portfolio._id, instrumentId: order.instrumentId },
    null,
    sessionOption,
  );

  // Shares already reserved against OTHER open sell orders are not available
  // here. An order that reserved its own shares gets them credited back, since
  // it is now spending exactly what it set aside. Without this, an immediate
  // market sell could sell the same shares a resting limit order is holding.
  const ownReservation = order.reservedQuantity;
  const sellable = holding ? holding.quantity - holding.blockedQuantity + ownReservation : 0;

  if (!holding || sellable < order.quantity) {
    throw new ApiError(
      409,
      ERROR_CODES.INSUFFICIENT_HOLDINGS,
      `You do not have enough unreserved shares of ${order.symbol} to complete this sale.` +
        (holding && holding.blockedQuantity > 0
          ? ` ${holding.blockedQuantity} share(s) are reserved against open sell orders.`
          : ''),
    );
  }

  const proceeds = sellProceeds(turnover, fees);

  // Realised P&L = net proceeds minus the cost basis of the shares sold.
  const costOfSold = holding.averageCost * order.quantity;
  const realisedPnl = proceeds - costOfSold;

  holding.quantity -= order.quantity;
  // Average cost is deliberately untouched: selling does not re-price the
  // remaining shares.
  holding.investedAmount = Math.max(0, holding.investedAmount - costOfSold);
  holding.realisedPnl += realisedPnl;
  if (order.reservedQuantity > 0) {
    holding.blockedQuantity = Math.max(0, holding.blockedQuantity - order.reservedQuantity);
  }

  if (holding.quantity === 0) {
    // Position fully closed. The realised P&L lives on in the wallet and the
    // ledger, so deleting the empty row loses nothing.
    await holding.deleteOne(sessionOption);
  } else {
    await holding.save(sessionOption);
  }

  await Portfolio.updateOne(
    { _id: portfolio._id },
    {
      $inc: {
        cashAvailable: proceeds,
        realisedPnl,
        totalFeesPaid: fees.total,
      },
    },
    sessionOption,
  );

  void fillPrice;
  return realisedPnl;
}

// --------------------------------------------------------------- cancellation

export async function cancelOrder(userId: Types.ObjectId, orderId: string): Promise<OrderDto> {
  return withTransaction(async (session) => {
    const sessionOption = session ? { session } : {};
    const order = await Order.findOne({ _id: orderId, userId }, null, sessionOption);

    if (!order) throw ApiError.notFound('Order not found.');

    if (order.status !== 'PENDING') {
      throw new ApiError(
        409,
        ERROR_CODES.ORDER_NOT_CANCELLABLE,
        `This order is ${order.status.toLowerCase()} and can no longer be cancelled.`,
      );
    }

    await releaseReservation(order, session);

    order.status = 'CANCELLED';
    order.reservedCash = 0;
    order.reservedQuantity = 0;
    await order.save(sessionOption);

    return toOrderDto(order);
  });
}

/** Returns reserved cash or shares to the user. Safe to call repeatedly. */
export async function releaseReservation(
  order: OrderDocument,
  session: ClientSession | undefined,
): Promise<void> {
  const sessionOption = session ? { session } : {};

  if (order.reservedCash > 0) {
    await Portfolio.updateOne(
      { _id: order.portfolioId },
      { $inc: { cashBlocked: -order.reservedCash, cashAvailable: order.reservedCash } },
      sessionOption,
    );
  }

  if (order.reservedQuantity > 0) {
    await Holding.updateOne(
      { portfolioId: order.portfolioId, instrumentId: order.instrumentId },
      { $inc: { blockedQuantity: -order.reservedQuantity } },
      sessionOption,
    );
  }
}

/** Marks an order rejected and returns anything it was holding. */
export async function rejectOrder(order: OrderDocument, reason: string): Promise<void> {
  await withTransaction(async (session) => {
    await releaseReservation(order, session);
    order.status = 'REJECTED';
    order.rejectReason = reason;
    order.reservedCash = 0;
    order.reservedQuantity = 0;
    await order.save(session ? { session } : {});
  });
  logger.info({ orderId: order._id.toString(), reason }, 'Order rejected');
}

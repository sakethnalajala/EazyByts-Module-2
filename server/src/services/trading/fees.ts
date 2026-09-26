import {
  DEFAULT_INDIA_FEES,
  DEFAULT_US_FEES,
  EMPTY_FEE_BREAKDOWN,
  applyRate,
  type FeeBreakdown,
  type Market,
  type OrderSide,
} from '@smd/shared';

/**
 * Simulated brokerage, exchange and statutory charges.
 *
 * Two rules govern every line here:
 *
 * 1. **Integer minor units throughout.** Turnover arrives in paise or cents and
 *    every charge is rounded to a whole minor unit before being summed. Summing
 *    floats and rounding at the end would leave the ledger off by a paisa in
 *    ways that compound across thousands of trades.
 *
 * 2. **Round UP, in the platform's favour.** That is how real brokers charge,
 *    and rounding down would let a user shave a fraction off every trade.
 *
 * These are educational approximations of the 2026 Indian discount-broker
 * delivery slab and the US zero-commission structure. They are not tax advice,
 * and the UI says so wherever they are shown.
 */

export interface FeeInput {
  market: Market;
  side: OrderSide;
  /** Quantity x price, in minor units. */
  turnover: number;
  quantity: number;
}

function calculateIndiaFees(input: FeeInput): FeeBreakdown {
  const config = DEFAULT_INDIA_FEES;
  const { turnover, side } = input;

  // Equity delivery is brokerage-free at most Indian discount brokers. The cap
  // is kept so a non-zero rate can be configured without a code change.
  const brokerage = Math.min(
    applyRate(turnover, config.brokerageRate),
    config.brokerageRate > 0 ? config.brokerageCapMinor : 0,
  );

  // Securities Transaction Tax applies to BOTH sides for delivery trades.
  const stt = applyRate(turnover, config.sttRate);
  const exchange = applyRate(turnover, config.exchangeRate);
  const sebi = applyRate(turnover, config.sebiRate);
  // Stamp duty is levied on the BUY side only.
  const stamp = side === 'BUY' ? applyRate(turnover, config.stampRate) : 0;
  // GST applies to brokerage + exchange + SEBI, never to STT or stamp duty.
  const gst = applyRate(brokerage + exchange + sebi, config.gstRate);

  const total = brokerage + stt + exchange + sebi + stamp + gst;

  return { brokerage, stt, exchange, sebi, stamp, gst, secFee: 0, taf: 0, total };
}

function calculateUsFees(input: FeeInput): FeeBreakdown {
  const config = DEFAULT_US_FEES;
  const { turnover, side, quantity } = input;

  const brokerage = applyRate(turnover, config.brokerageRate);

  // Both US regulatory fees are charged on SALE proceeds only.
  const secFee = side === 'SELL' ? applyRate(turnover, config.secFeeRate) : 0;
  const taf =
    side === 'SELL'
      ? Math.min(Math.ceil(quantity * config.tafPerShareMinor), config.tafCapMinor)
      : 0;

  const total = brokerage + secFee + taf;

  return { ...EMPTY_FEE_BREAKDOWN, brokerage, secFee, taf, total };
}

/** Full charge breakdown for one fill. */
export function calculateFees(input: FeeInput): FeeBreakdown {
  if (input.turnover <= 0 || input.quantity <= 0) return { ...EMPTY_FEE_BREAKDOWN };
  return input.market === 'IN' ? calculateIndiaFees(input) : calculateUsFees(input);
}

/**
 * Cash a BUY actually costs: turnover plus charges.
 * Used both to reserve funds and to debit the wallet on fill.
 */
export function buyCost(turnover: number, fees: FeeBreakdown): number {
  return turnover + fees.total;
}

/** Cash a SELL actually returns: turnover minus charges. */
export function sellProceeds(turnover: number, fees: FeeBreakdown): number {
  return turnover - fees.total;
}

/**
 * Cash to reserve for an open BUY order.
 *
 * Adds a small buffer over the estimate so that a fill at exactly the limit
 * price can never leave the wallet short once charges are applied.
 */
export function reserveForBuy(turnover: number, market: Market, quantity: number): number {
  const fees = calculateFees({ market, side: 'BUY', turnover, quantity });
  return turnover + fees.total;
}

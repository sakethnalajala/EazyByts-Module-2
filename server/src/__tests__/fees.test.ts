import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  toMinor,
  toMajor,
  weightedAverage,
  applyRate,
  multiplyMinor,
} from '@smd/shared';
import { buyCost, calculateFees, reserveForBuy, sellProceeds } from '../services/trading/fees.js';

/**
 * Fee and money arithmetic.
 *
 * Written against hand-computed expected values rather than against the
 * implementation, so the test would catch the implementation being wrong. Every
 * figure below is in MINOR units (paise or cents).
 */

describe('Indian equity delivery charges', () => {
  // Rs 1,00,000 turnover = 1,00,00,000 paise
  const turnover = 10_000_000;

  it('charges the correct BUY breakdown', () => {
    const fees = calculateFees({ market: 'IN', side: 'BUY', turnover, quantity: 100 });

    expect(fees.brokerage).toBe(0); // delivery is brokerage-free
    expect(fees.stt).toBe(10_000); // 0.1%        = Rs 100.00
    expect(fees.exchange).toBe(297); // 0.00297%   = Rs 2.97
    expect(fees.sebi).toBe(10); // Rs 10/crore     = Rs 0.10
    expect(fees.stamp).toBe(1_500); // 0.015%      = Rs 15.00
    expect(fees.gst).toBe(56); // 18% of (297+10)  = Rs 0.56
    expect(fees.total).toBe(11_863); //             = Rs 118.63

    // The total must equal the sum of its parts - no rounding slack.
    const sum = fees.brokerage + fees.stt + fees.exchange + fees.sebi + fees.stamp + fees.gst;
    expect(fees.total).toBe(sum);
  });

  it('omits stamp duty on the SELL side', () => {
    const fees = calculateFees({ market: 'IN', side: 'SELL', turnover, quantity: 100 });

    expect(fees.stamp).toBe(0);
    expect(fees.stt).toBe(10_000); // STT applies to both sides
    expect(fees.total).toBe(10_363); // Rs 103.63
  });

  it('charges no US-only fees on an Indian trade', () => {
    const fees = calculateFees({ market: 'IN', side: 'SELL', turnover, quantity: 100 });
    expect(fees.secFee).toBe(0);
    expect(fees.taf).toBe(0);
  });

  it('rounds each charge UP, in the platform favour', () => {
    // A turnover small enough that every rate lands on a fraction.
    const fees = calculateFees({ market: 'IN', side: 'BUY', turnover: 12_345, quantity: 1 });

    expect(fees.stt).toBe(13); // ceil(12.345)
    expect(fees.exchange).toBe(1); // ceil(0.366)
    expect(fees.sebi).toBe(1); // ceil(0.012)
    expect(fees.stamp).toBe(2); // ceil(1.851)
    // Every value is a whole number of paise.
    expect(Number.isInteger(fees.total)).toBe(true);
  });
});

describe('US equity charges', () => {
  // $10,000 turnover = 1,000,000 cents
  const turnover = 1_000_000;

  it('charges nothing on a BUY', () => {
    const fees = calculateFees({ market: 'US', side: 'BUY', turnover, quantity: 100 });

    expect(fees.total).toBe(0);
    expect(fees.brokerage).toBe(0);
    expect(fees.secFee).toBe(0);
    expect(fees.taf).toBe(0);
  });

  it('charges SEC and FINRA fees on a SELL only', () => {
    const fees = calculateFees({ market: 'US', side: 'SELL', turnover, quantity: 100 });

    expect(fees.secFee).toBe(28); // ceil(1,000,000 x 0.0000278) = $0.28
    expect(fees.taf).toBe(2); // ceil(100 x 0.0166 cents)        = $0.02
    expect(fees.total).toBe(30); //                              = $0.30
  });

  it('caps the FINRA trading activity fee at $8.30', () => {
    const fees = calculateFees({
      market: 'US',
      side: 'SELL',
      turnover: 100_000_000,
      quantity: 10_000_000, // far past the cap
    });

    expect(fees.taf).toBe(830);
  });

  it('never applies Indian charges to a US trade', () => {
    const fees = calculateFees({ market: 'US', side: 'SELL', turnover, quantity: 100 });
    expect(fees.stt).toBe(0);
    expect(fees.stamp).toBe(0);
    expect(fees.gst).toBe(0);
  });
});

describe('edge cases', () => {
  it('returns an empty breakdown for zero turnover', () => {
    expect(calculateFees({ market: 'IN', side: 'BUY', turnover: 0, quantity: 0 }).total).toBe(0);
  });

  it('returns an empty breakdown for a negative turnover', () => {
    expect(calculateFees({ market: 'IN', side: 'BUY', turnover: -100, quantity: 1 }).total).toBe(0);
  });
});

describe('cost and proceeds', () => {
  it('adds charges to a BUY and subtracts them from a SELL', () => {
    const turnover = 10_000_000;
    const buyFees = calculateFees({ market: 'IN', side: 'BUY', turnover, quantity: 100 });
    const sellFees = calculateFees({ market: 'IN', side: 'SELL', turnover, quantity: 100 });

    expect(buyCost(turnover, buyFees)).toBe(10_011_863);
    expect(sellProceeds(turnover, sellFees)).toBe(9_989_637);

    // A same-price round trip must LOSE money - it pays charges twice.
    expect(sellProceeds(turnover, sellFees)).toBeLessThan(buyCost(turnover, buyFees));
  });

  it('reserves enough to cover the trade and its charges', () => {
    const turnover = 10_000_000;
    const reserved = reserveForBuy(turnover, 'IN', 100);
    const fees = calculateFees({ market: 'IN', side: 'BUY', turnover, quantity: 100 });

    expect(reserved).toBe(buyCost(turnover, fees));
    expect(reserved).toBeGreaterThan(turnover);
  });
});

describe('money primitives', () => {
  it('converts between major and minor units exactly', () => {
    expect(toMinor(1234.56)).toBe(123_456);
    expect(toMinor(0.1)).toBe(10);
    expect(toMinor(2945)).toBe(294_500);
    expect(toMajor(123_456)).toBe(1234.56);
  });

  it('avoids the classic float rounding error', () => {
    // 0.1 + 0.2 !== 0.3 in floats. In minor units it is exact.
    expect(toMinor(0.1) + toMinor(0.2)).toBe(toMinor(0.3));
    expect(toMinor(8.115)).toBe(812);
  });

  it('multiplies price by quantity exactly', () => {
    expect(multiplyMinor(294_500, 37)).toBe(10_896_500);
  });

  it('refuses a fractional share quantity', () => {
    expect(() => multiplyMinor(100, 1.5)).toThrow(/whole number/i);
  });

  it('computes weighted average cost', () => {
    // 10 @ 100 and 10 @ 120 -> average 110
    expect(weightedAverage(10_000 + 12_000, 20)).toBe(1_100);
  });

  it('returns zero average cost for an empty position', () => {
    expect(weightedAverage(0, 0)).toBe(0);
  });

  it('rounds rates up by default', () => {
    expect(applyRate(1000, 0.0001)).toBe(1); // 0.1 -> 1
    expect(applyRate(1000, 0.0001, 'round')).toBe(0); // 0.1 -> 0
  });
});

describe('display formatting', () => {
  it('uses Indian digit grouping for INR', () => {
    // 12,34,567.89 - lakh grouping, not 1,234,567.89
    expect(formatMoney(123_456_789, 'INR')).toBe('₹12,34,567.89');
  });

  it('uses Western grouping for USD', () => {
    expect(formatMoney(123_456_789, 'USD')).toBe('$1,234,567.89');
  });

  it('formats a signed value for P&L display', () => {
    // Sign precedes the currency symbol, consistently for both directions.
    expect(formatMoney(50_000, 'INR', { signed: true })).toBe('+₹500.00');
    expect(formatMoney(-50_000, 'INR', { signed: true })).toBe('-₹500.00');
  });

  it('omits the plus sign unless signed display is requested', () => {
    expect(formatMoney(50_000, 'INR')).toBe('₹500.00');
    // A negative always shows its sign, signed mode or not.
    expect(formatMoney(-50_000, 'INR')).toBe('-₹500.00');
  });

  it('abbreviates INR in lakh and crore', () => {
    expect(formatMoney(10_000_000, 'INR', { compact: true })).toBe('₹1.00L');
    expect(formatMoney(1_000_000_000, 'INR', { compact: true })).toBe('₹1.00Cr');
  });

  it('abbreviates USD in K and M', () => {
    expect(formatMoney(1_000_000, 'USD', { compact: true })).toBe('$10.00K');
  });
});

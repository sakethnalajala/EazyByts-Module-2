import type { Market } from './markets.js';

/**
 * Trading sessions and holiday calendars.
 *
 * Times are the exchange's local wall-clock. The server resolves them against
 * the exchange timezone rather than the host's, because Render runs in UTC and
 * a naive `new Date()` comparison would open the Indian market at the wrong
 * hour.
 */

export interface SessionDefinition {
  timezone: string;
  /** Local open/close as "HH:MM" in the exchange timezone. */
  open: string;
  close: string;
  label: string;
}

export const MARKET_SESSIONS: Readonly<Record<Market, SessionDefinition>> = {
  IN: {
    timezone: 'Asia/Kolkata',
    open: '09:15',
    close: '15:30',
    label: 'NSE / BSE, 09:15-15:30 IST, Mon-Fri',
  },
  US: {
    timezone: 'America/New_York',
    open: '09:30',
    close: '16:00',
    label: 'NASDAQ / NYSE, 09:30-16:00 ET, Mon-Fri',
  },
};

/**
 * Trading holidays as YYYY-MM-DD in the exchange's local date.
 *
 * Maintained by hand for the simulation year. An unknown future date simply
 * falls back to the weekday rule, which is the safe direction to be wrong in:
 * a missed holiday means a simulated order fills on a day the real exchange was
 * shut, and the app never claims its calendar is authoritative.
 */
export const MARKET_HOLIDAYS: Readonly<Record<Market, readonly string[]>> = {
  IN: [
    '2026-01-26', // Republic Day
    '2026-03-04', // Holi
    '2026-03-21', // Id-ul-Fitr
    '2026-04-01', // Annual bank closing
    '2026-04-03', // Good Friday
    '2026-04-14', // Dr. Ambedkar Jayanti
    '2026-05-01', // Maharashtra Day
    '2026-05-27', // Bakri Id
    '2026-08-15', // Independence Day
    '2026-08-26', // Ganesh Chaturthi
    '2026-10-02', // Gandhi Jayanti
    '2026-10-20', // Dussehra
    '2026-11-09', // Diwali Laxmi Pujan
    '2026-11-24', // Guru Nanak Jayanti
    '2026-12-25', // Christmas
  ],
  US: [
    '2026-01-01', // New Year's Day
    '2026-01-19', // Martin Luther King Jr. Day
    '2026-02-16', // Washington's Birthday
    '2026-04-03', // Good Friday
    '2026-05-25', // Memorial Day
    '2026-06-19', // Juneteenth
    '2026-07-03', // Independence Day (observed)
    '2026-09-07', // Labor Day
    '2026-11-26', // Thanksgiving
    '2026-12-25', // Christmas
  ],
};

export const MARKET_HOLIDAY_NAMES: Readonly<Record<string, string>> = {
  '2026-01-26': 'Republic Day',
  '2026-03-04': 'Holi',
  '2026-04-03': 'Good Friday',
  '2026-08-15': 'Independence Day',
  '2026-10-02': 'Gandhi Jayanti',
  '2026-11-09': 'Diwali',
  '2026-12-25': 'Christmas',
  '2026-01-01': "New Year's Day",
  '2026-11-26': 'Thanksgiving',
  '2026-07-03': 'Independence Day (observed)',
};

/** How stale a quote may be before a market order is refused. */
export const MAX_QUOTE_AGE_MS = 15 * 60 * 1000;

/** How long a GTC order survives before expiring. */
export const GTC_VALIDITY_DAYS = 7;

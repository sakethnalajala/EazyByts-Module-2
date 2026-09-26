import {
  MARKET_HOLIDAYS,
  MARKET_HOLIDAY_NAMES,
  MARKET_SESSIONS,
  type Market,
  type MarketStatus,
} from '@smd/shared';

/**
 * Trading session calculation.
 *
 * Everything resolves through the EXCHANGE's timezone, never the host's.
 * Render runs in UTC, so a naive `new Date().getHours()` would open the Indian
 * market at 09:15 UTC - four and a half hours late, every single day.
 */

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Decomposes an instant into wall-clock parts in the given IANA timezone. */
export function localParts(instant: Date, timeZone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl renders midnight as "24" in some environments under hour12:false.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAY_INDEX[parts.weekday ?? 'Mon'] ?? 1,
  };
}

function dateKey(parts: LocalParts): string {
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

function toMinutes(time: string): number {
  const [hour = '0', minute = '0'] = time.split(':');
  return Number(hour) * 60 + Number(minute);
}

export function isWeekend(parts: LocalParts): boolean {
  return parts.weekday === 0 || parts.weekday === 6;
}

export function isHoliday(market: Market, parts: LocalParts): boolean {
  return MARKET_HOLIDAYS[market].includes(dateKey(parts));
}

/**
 * Finds the next instant the market opens.
 *
 * Walks forward a day at a time, skipping weekends and holidays. Capped at 14
 * iterations so an unknown future can never spin forever.
 */
function findNextOpen(market: Market, from: Date): Date | null {
  const session = MARKET_SESSIONS[market];
  const openMinutes = toMinutes(session.open);

  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = new Date(from.getTime() + offset * 24 * 60 * 60 * 1000);
    const parts = localParts(candidate, session.timezone);

    if (isWeekend(parts) || isHoliday(market, parts)) continue;

    const nowMinutes = parts.hour * 60 + parts.minute;
    // Today only counts if the open has not already passed.
    if (offset === 0 && nowMinutes >= openMinutes) continue;

    return instantForLocalTime(parts, session.timezone, openMinutes);
  }

  return null;
}

/**
 * Builds a UTC instant for a given local date and minute-of-day.
 *
 * Derives the zone's offset empirically rather than hardcoding it, so it stays
 * correct across US daylight-saving transitions.
 */
function instantForLocalTime(parts: LocalParts, timeZone: string, minuteOfDay: number): Date {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;

  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, 0);
  const probe = new Date(asUtc);
  const probeParts = localParts(probe, timeZone);

  const probeMinutes = probeParts.hour * 60 + probeParts.minute;
  const offsetMinutes = probeMinutes - minuteOfDay;

  return new Date(asUtc - offsetMinutes * 60 * 1000);
}

export function getMarketStatus(market: Market, now: Date = new Date()): MarketStatus {
  const session = MARKET_SESSIONS[market];
  const parts = localParts(now, session.timezone);
  const openMinutes = toMinutes(session.open);
  const closeMinutes = toMinutes(session.close);
  const nowMinutes = parts.hour * 60 + parts.minute;

  const base = {
    market,
    session: { open: session.open, close: session.close, timezone: session.timezone },
  };

  if (isWeekend(parts)) {
    return {
      ...base,
      isOpen: false,
      reason: 'weekend',
      nextOpen: findNextOpen(market, now)?.toISOString() ?? null,
      nextClose: null,
    };
  }

  if (isHoliday(market, parts)) {
    const name = MARKET_HOLIDAY_NAMES[dateKey(parts)];
    return {
      ...base,
      isOpen: false,
      reason: 'holiday',
      nextOpen: findNextOpen(market, now)?.toISOString() ?? null,
      nextClose: null,
      ...(name ? { holidayName: name } : {}),
    };
  }

  if (nowMinutes < openMinutes) {
    return {
      ...base,
      isOpen: false,
      reason: 'before-open',
      nextOpen: instantForLocalTime(parts, session.timezone, openMinutes).toISOString(),
      nextClose: null,
    };
  }

  if (nowMinutes >= closeMinutes) {
    return {
      ...base,
      isOpen: false,
      reason: 'after-close',
      nextOpen: findNextOpen(market, now)?.toISOString() ?? null,
      nextClose: null,
    };
  }

  return {
    ...base,
    isOpen: true,
    reason: 'open',
    nextOpen: null,
    nextClose: instantForLocalTime(parts, session.timezone, closeMinutes).toISOString(),
  };
}

export function isMarketOpen(market: Market, now: Date = new Date()): boolean {
  return getMarketStatus(market, now).isOpen;
}

/** Session close for DAY-order expiry. Falls back to the next open's close. */
export function sessionCloseInstant(market: Market, now: Date = new Date()): Date {
  const session = MARKET_SESSIONS[market];
  const parts = localParts(now, session.timezone);
  return instantForLocalTime(parts, session.timezone, toMinutes(session.close));
}

export function getAllMarketStatuses(now: Date = new Date()): MarketStatus[] {
  return [getMarketStatus('IN', now), getMarketStatus('US', now)];
}

import { Redis } from 'ioredis';
import type { DependencyStatus } from '@smd/shared';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * Cache with a mandatory in-process fallback.
 *
 * Redis is optional by design. When REDIS_URL is absent - or when Redis is
 * configured but unreachable - every call transparently falls back to a
 * bounded in-process LRU. The app must never fail because a cache is missing;
 * a cache exists to make things faster, not to make them possible.
 */

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

/** Bounded so a long-running process cannot leak memory through the cache. */
const MEMORY_MAX_ENTRIES = 2_000;
const memory = new Map<string, MemoryEntry>();

let redis: Redis | null = null;
let redisHealthy = false;

function evictIfNeeded(): void {
  if (memory.size <= MEMORY_MAX_ENTRIES) return;
  // Map preserves insertion order, so the oldest key is the first one.
  const oldest = memory.keys().next();
  if (!oldest.done) memory.delete(oldest.value);
}

function memoryGet(key: string): string | null {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key: string, value: string, ttlSeconds: number): void {
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  evictIfNeeded();
}

export function initCache(): void {
  if (!env.REDIS_URL) {
    logger.info('Redis not configured; using in-process cache');
    return;
  }

  redis = new Redis(env.REDIS_URL, {
    // Fail fast and fall back rather than queueing commands forever.
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    connectTimeout: 5_000,
    lazyConnect: false,
  });

  redis.on('ready', () => {
    redisHealthy = true;
    logger.info('Redis connected');
  });
  redis.on('error', (error: Error) => {
    if (redisHealthy) logger.warn({ err: error.message }, 'Redis error; falling back to memory');
    redisHealthy = false;
  });
  redis.on('end', () => {
    redisHealthy = false;
  });
}

export async function closeCache(): Promise<void> {
  memory.clear();
  if (redis) {
    await redis.quit().catch(() => redis?.disconnect());
    redis = null;
    redisHealthy = false;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  let raw: string | null = null;

  if (redis && redisHealthy) {
    try {
      raw = await redis.get(key);
    } catch {
      redisHealthy = false;
    }
  }

  raw ??= memoryGet(key);
  if (raw === null) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    // A corrupt entry is not worth a failed request.
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const raw = JSON.stringify(value);

  // Always write to memory too: it is the fallback if Redis drops mid-flight.
  memorySet(key, raw, ttlSeconds);

  if (redis && redisHealthy) {
    try {
      await redis.set(key, raw, 'EX', ttlSeconds);
    } catch {
      redisHealthy = false;
    }
  }
}

export async function cacheDelete(key: string): Promise<void> {
  memory.delete(key);
  if (redis && redisHealthy) {
    try {
      await redis.del(key);
    } catch {
      redisHealthy = false;
    }
  }
}

/** Reads many keys at once; missing entries come back as null in place. */
export async function cacheGetMany<T>(keys: string[]): Promise<(T | null)[]> {
  if (keys.length === 0) return [];

  if (redis && redisHealthy) {
    try {
      const values = await redis.mget(keys);
      return values.map((raw, index) => {
        const fallback = raw ?? memoryGet(keys[index] as string);
        if (fallback === null) return null;
        try {
          return JSON.parse(fallback) as T;
        } catch {
          return null;
        }
      });
    } catch {
      redisHealthy = false;
    }
  }

  return keys.map((key) => {
    const raw = memoryGet(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  });
}

/** Cache-aside helper: return the cached value, or compute, store and return. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;

  const value = await compute();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

export async function checkCache(): Promise<DependencyStatus> {
  if (!env.REDIS_URL) {
    return {
      state: 'disabled',
      message: 'REDIS_URL not configured; using in-process cache',
    };
  }

  if (!redis) return { state: 'down', message: 'client not initialised' };

  const startedAt = performance.now();
  try {
    await redis.ping();
    redisHealthy = true;
    return { state: 'up', latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    redisHealthy = false;
    return {
      state: 'down',
      message: error instanceof Error ? error.message : 'ping failed',
    };
  }
}

/** True when Redis is actually serving; used by health reporting and tests. */
export function isRedisActive(): boolean {
  return redisHealthy;
}

/** Test seam: clears the in-process layer between cases. */
export function clearMemoryCache(): void {
  memory.clear();
}

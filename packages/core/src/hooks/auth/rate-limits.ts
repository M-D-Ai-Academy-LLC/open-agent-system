/**
 * Rate Limit Hook (#11)
 *
 * Implements rate limiting for API requests.
 * Use cases: preventing abuse, fair usage, cost control.
 */

import type {
  HookHandler,
  HookResult,
  RateLimitInput,
  RateLimitOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default rate limit handler - simple in-memory rate limiter
 */
export const defaultRateLimitHandler: HookHandler<
  RateLimitInput,
  RateLimitOutput
> = async (input, _context): Promise<HookResult<RateLimitOutput>> => {
  const remaining = input.limit - input.currentUsage;
  const resetAt = Date.now() + input.windowMs;

  if (remaining <= 0) {
    return {
      success: true,
      data: {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil(input.windowMs / 1000),
      },
    };
  }

  return {
    success: true,
    data: {
      allowed: true,
      remaining: remaining - 1,
      resetAt,
    },
  };
};

/**
 * Rate limit bucket for tracking
 */
interface RateLimitBucket {
  count: number;
  windowStart: number;
}

/**
 * Creates a sliding window rate limiter
 */
export function createSlidingWindowRateLimiter(
  defaultLimit: number = 100,
  defaultWindowMs: number = 60000
): HookHandler<RateLimitInput, RateLimitOutput> {
  const buckets = new Map<string, RateLimitBucket[]>();

  return async (input, _context): Promise<HookResult<RateLimitOutput>> => {
    const key = `${input.identifier}:${input.resource}`;
    const limit = input.limit || defaultLimit;
    const windowMs = input.windowMs || defaultWindowMs;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create bucket list for this key
    let keyBuckets = buckets.get(key);
    if (!keyBuckets) {
      keyBuckets = [];
      buckets.set(key, keyBuckets);
    }

    // Remove expired buckets
    while (keyBuckets.length > 0 && keyBuckets[0]!.windowStart < windowStart) {
      keyBuckets.shift();
    }

    // Count requests in current window
    const currentCount = keyBuckets.reduce((sum, b) => sum + b.count, 0);
    const remaining = limit - currentCount;

    if (remaining <= 0) {
      const oldestBucket = keyBuckets[0];
      const resetAt = oldestBucket ? oldestBucket.windowStart + windowMs : now + windowMs;

      return {
        success: true,
        data: {
          allowed: false,
          remaining: 0,
          resetAt,
          retryAfter: Math.ceil((resetAt - now) / 1000),
        },
      };
    }

    // Add new request to current bucket
    const currentMinute = Math.floor(now / 1000) * 1000;
    let currentBucket = keyBuckets.find((b) => b.windowStart === currentMinute);

    if (!currentBucket) {
      currentBucket = { count: 0, windowStart: currentMinute };
      keyBuckets.push(currentBucket);
    }

    currentBucket.count++;

    return {
      success: true,
      data: {
        allowed: true,
        remaining: remaining - 1,
        resetAt: now + windowMs,
      },
    };
  };
}

/**
 * Creates a token bucket rate limiter
 */
export function createTokenBucketRateLimiter(
  capacity: number = 100,
  refillRate: number = 10, // tokens per second
  refillIntervalMs: number = 1000
): HookHandler<RateLimitInput, RateLimitOutput> {
  const buckets = new Map<string, { tokens: number; lastRefill: number }>();

  return async (input, _context): Promise<HookResult<RateLimitOutput>> => {
    const key = `${input.identifier}:${input.resource}`;
    const now = Date.now();

    // Get or create bucket
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: now };
      buckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    const elapsed = now - bucket.lastRefill;
    const refillIntervals = Math.floor(elapsed / refillIntervalMs);

    if (refillIntervals > 0) {
      bucket.tokens = Math.min(capacity, bucket.tokens + refillIntervals * refillRate);
      bucket.lastRefill = now;
    }

    // Check if we have tokens
    if (bucket.tokens < 1) {
      const nextRefillMs = refillIntervalMs - (elapsed % refillIntervalMs);

      return {
        success: true,
        data: {
          allowed: false,
          remaining: 0,
          resetAt: now + nextRefillMs,
          retryAfter: Math.ceil(nextRefillMs / 1000),
        },
      };
    }

    // Consume a token
    bucket.tokens--;

    return {
      success: true,
      data: {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetAt: now + refillIntervalMs,
      },
    };
  };
}

/**
 * Creates a rate limiter with tiered limits
 */
export function createTieredRateLimiter(
  tiers: Record<string, { limit: number; windowMs: number }>,
  getTier: (identifier: string) => Promise<string>
): HookHandler<RateLimitInput, RateLimitOutput> {
  const usage = new Map<string, { count: number; windowStart: number }>();

  return async (input, _context): Promise<HookResult<RateLimitOutput>> => {
    const tier = await getTier(input.identifier);
    const tierConfig = tiers[tier] ?? { limit: 10, windowMs: 60000 };
    const key = `${input.identifier}:${input.resource}`;
    const now = Date.now();

    // Get or reset usage
    let current = usage.get(key);
    if (!current || now - current.windowStart > tierConfig.windowMs) {
      current = { count: 0, windowStart: now };
      usage.set(key, current);
    }

    const remaining = tierConfig.limit - current.count;
    const resetAt = current.windowStart + tierConfig.windowMs;

    if (remaining <= 0) {
      return {
        success: true,
        data: {
          allowed: false,
          remaining: 0,
          resetAt,
          retryAfter: Math.ceil((resetAt - now) / 1000),
        },
        metadata: { tier, limit: tierConfig.limit },
      };
    }

    current.count++;

    return {
      success: true,
      data: {
        allowed: true,
        remaining: remaining - 1,
        resetAt,
      },
      metadata: { tier, limit: tierConfig.limit },
    };
  };
}

/**
 * Register the default rate limit hook
 */
export function registerDefaultRateLimit(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.RATE_LIMIT,
    {
      id: 'default-rate-limit',
      name: 'Default Rate Limit',
      priority: 'high',
      description: 'Simple rate limiter based on input parameters',
    },
    defaultRateLimitHandler
  );
}

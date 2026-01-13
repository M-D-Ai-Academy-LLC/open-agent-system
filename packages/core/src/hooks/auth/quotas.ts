/**
 * Quota Check Hook (#12)
 *
 * Manages usage quotas for tokens, requests, and costs.
 * Use cases: billing limits, fair usage policies, resource allocation.
 */

import type {
  HookHandler,
  HookResult,
  QuotaCheckInput,
  QuotaCheckOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default quota check handler - basic limit check
 */
export const defaultQuotaCheckHandler: HookHandler<
  QuotaCheckInput,
  QuotaCheckOutput
> = async (input, _context): Promise<HookResult<QuotaCheckOutput>> => {
  const remaining = input.limit - input.currentUsage;
  const allowed = input.requestedAmount <= remaining;

  return {
    success: true,
    data: {
      allowed,
      remaining: Math.max(0, remaining - (allowed ? input.requestedAmount : 0)),
      overage: allowed ? undefined : input.requestedAmount - remaining,
    },
  };
};

/**
 * Quota configuration
 */
export interface QuotaConfig {
  tokens?: number;
  requests?: number;
  cost?: number;
  period?: 'hourly' | 'daily' | 'weekly' | 'monthly';
}

/**
 * Creates a multi-dimensional quota checker
 */
export function createMultiQuotaChecker(
  getQuotas: (userId: string) => Promise<QuotaConfig>,
  getUsage: (userId: string, period: string) => Promise<{ tokens: number; requests: number; cost: number }>
): HookHandler<QuotaCheckInput, QuotaCheckOutput> {
  return async (input, _context): Promise<HookResult<QuotaCheckOutput>> => {
    try {
      const quotas = await getQuotas(input.userId);
      const usage = await getUsage(input.userId, quotas.period ?? 'monthly');

      // Get the relevant quota and usage based on type
      const quotaLimit = quotas[input.quotaType];
      const currentUsage = usage[input.quotaType];

      if (quotaLimit === undefined) {
        // No quota defined for this type - allow
        return {
          success: true,
          data: {
            allowed: true,
            remaining: Infinity,
          },
        };
      }

      const remaining = quotaLimit - currentUsage;
      const allowed = input.requestedAmount <= remaining;

      return {
        success: true,
        data: {
          allowed,
          remaining: Math.max(0, remaining - (allowed ? input.requestedAmount : 0)),
          overage: allowed ? undefined : input.requestedAmount - remaining,
        },
        metadata: {
          quotaType: input.quotaType,
          period: quotas.period,
          limit: quotaLimit,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        recoverable: true,
      };
    }
  };
}

/**
 * Creates a soft quota checker (warns but allows overage)
 */
export function createSoftQuotaChecker(
  warningThreshold: number = 0.8,
  maxOverage: number = 0.2
): HookHandler<QuotaCheckInput, QuotaCheckOutput> {
  return async (input, _context): Promise<HookResult<QuotaCheckOutput>> => {
    const remaining = input.limit - input.currentUsage;
    const usagePercent = input.currentUsage / input.limit;
    const maxAllowed = input.limit * (1 + maxOverage);

    // Check if we're within max overage
    const newUsage = input.currentUsage + input.requestedAmount;
    const allowed = newUsage <= maxAllowed;

    const result: QuotaCheckOutput = {
      allowed,
      remaining: Math.max(0, remaining - input.requestedAmount),
      overage: newUsage > input.limit ? newUsage - input.limit : undefined,
    };

    // Add upgrade options if approaching limit
    if (usagePercent >= warningThreshold) {
      result.upgradeOptions = ['premium', 'enterprise'];
    }

    return {
      success: true,
      data: result,
      metadata: {
        usagePercent,
        isWarning: usagePercent >= warningThreshold,
        isSoftLimit: newUsage > input.limit,
      },
    };
  };
}

/**
 * Creates a quota checker with rollover support
 */
export function createRolloverQuotaChecker(
  rolloverPercent: number = 0.5,
  maxRollover: number = 1.0
): HookHandler<QuotaCheckInput, QuotaCheckOutput> {
  const rolloverBalance = new Map<string, number>();

  return async (input, _context): Promise<HookResult<QuotaCheckOutput>> => {
    const key = `${input.userId}:${input.quotaType}`;
    const rollover = rolloverBalance.get(key) ?? 0;

    // Effective limit includes rollover
    const effectiveLimit = input.limit + Math.min(rollover, input.limit * maxRollover);
    const remaining = effectiveLimit - input.currentUsage;
    const allowed = input.requestedAmount <= remaining;

    // Calculate new rollover for next period
    if (allowed && input.currentUsage + input.requestedAmount >= input.limit) {
      // Using base limit, no rollover earned
      rolloverBalance.set(key, 0);
    } else if (!allowed) {
      // Over quota, no rollover earned
      rolloverBalance.set(key, 0);
    } else {
      // Track unused quota for potential rollover
      const unused = input.limit - (input.currentUsage + input.requestedAmount);
      const newRollover = Math.min(unused * rolloverPercent, input.limit * maxRollover);
      rolloverBalance.set(key, newRollover);
    }

    return {
      success: true,
      data: {
        allowed,
        remaining: Math.max(0, remaining - (allowed ? input.requestedAmount : 0)),
        overage: allowed ? undefined : input.requestedAmount - remaining,
      },
      metadata: {
        effectiveLimit,
        rolloverUsed: rollover,
        baseLimit: input.limit,
      },
    };
  };
}

/**
 * Creates a burst quota checker (allows temporary burst above limit)
 */
export function createBurstQuotaChecker(
  burstMultiplier: number = 2.0,
  burstWindowMs: number = 60000
): HookHandler<QuotaCheckInput, QuotaCheckOutput> {
  const burstUsage = new Map<string, { count: number; windowStart: number }>();

  return async (input, _context): Promise<HookResult<QuotaCheckOutput>> => {
    const key = `${input.userId}:${input.quotaType}`;
    const now = Date.now();
    const burstLimit = input.limit * burstMultiplier;

    // Get or reset burst window
    let burst = burstUsage.get(key);
    if (!burst || now - burst.windowStart > burstWindowMs) {
      burst = { count: 0, windowStart: now };
      burstUsage.set(key, burst);
    }

    // Check sustained limit
    const sustainedRemaining = input.limit - input.currentUsage;
    if (input.requestedAmount <= sustainedRemaining) {
      // Within sustained limit
      return {
        success: true,
        data: {
          allowed: true,
          remaining: sustainedRemaining - input.requestedAmount,
        },
      };
    }

    // Check burst limit
    const burstRemaining = burstLimit - (input.currentUsage + burst.count);
    if (input.requestedAmount <= burstRemaining) {
      burst.count += input.requestedAmount;

      return {
        success: true,
        data: {
          allowed: true,
          remaining: burstRemaining - input.requestedAmount,
        },
        metadata: {
          isBurst: true,
          burstUsed: burst.count,
          burstLimit,
        },
      };
    }

    return {
      success: true,
      data: {
        allowed: false,
        remaining: 0,
        overage: input.requestedAmount - burstRemaining,
      },
    };
  };
}

/**
 * Register the default quota check hook
 */
export function registerDefaultQuotaCheck(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.QUOTA_CHECK,
    {
      id: 'default-quota-check',
      name: 'Default Quota Check',
      priority: 'high',
      description: 'Basic quota limit checking',
    },
    defaultQuotaCheckHandler
  );
}

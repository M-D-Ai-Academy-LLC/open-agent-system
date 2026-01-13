/**
 * Cost Tracking Hook (#41)
 *
 * Tracks costs for LLM API usage.
 * Use cases: budget management, cost allocation, usage optimization.
 */

import type {
  HookHandler,
  HookResult,
  CostTrackingInput,
  CostTrackingOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default pricing for common models (per 1K tokens)
 */
export const DefaultPricing: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },

  // OpenAI
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },

  // Google
  'gemini-pro': { input: 0.00025, output: 0.0005 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
};

/**
 * Default cost tracking handler
 */
export const defaultCostTrackingHandler: HookHandler<
  CostTrackingInput,
  CostTrackingOutput
> = async (input, _context): Promise<HookResult<CostTrackingOutput>> => {
  const pricing = DefaultPricing[input.model] ?? { input: 0.001, output: 0.002 };

  const inputCost = (input.inputTokens / 1000) * pricing.input;
  const outputCost = (input.outputTokens / 1000) * pricing.output;

  // Apply cache discount (typically 90% off for cached tokens)
  const cacheDiscount = input.cached ? 0.9 : 0;
  const totalCost = (inputCost * (1 - cacheDiscount)) + outputCost;

  return {
    success: true,
    data: {
      cost: totalCost,
      currency: 'USD',
    },
  };
};

/**
 * Cost breakdown by category
 */
export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheDiscount: number;
  totalCost: number;
}

/**
 * Budget configuration
 */
export interface BudgetConfig {
  dailyLimit?: number;
  monthlyLimit?: number;
  perRequestLimit?: number;
  alertThresholds?: number[]; // Percentages (e.g., [50, 75, 90])
}

/**
 * Cost tracker interface
 */
export interface CostTracker {
  costs: Map<string, {
    daily: Map<string, number>; // date -> cost
    monthly: Map<string, number>; // month -> cost
    byModel: Map<string, number>;
    byProvider: Map<string, number>;
    total: number;
  }>;
  track: (userId: string, provider: string, model: string, cost: number) => void;
  getDailyCost: (userId: string, date?: string) => number;
  getMonthlyCost: (userId: string, month?: string) => number;
  getTotalCost: (userId: string) => number;
  getByModel: (userId: string) => Map<string, number>;
  getByProvider: (userId: string) => Map<string, number>;
  reset: (userId: string) => void;
}

/**
 * Creates a cost tracker
 */
export function createCostTracker(): CostTracker {
  const costs = new Map<string, {
    daily: Map<string, number>;
    monthly: Map<string, number>;
    byModel: Map<string, number>;
    byProvider: Map<string, number>;
    total: number;
  }>();

  const ensureUser = (userId: string) => {
    if (!costs.has(userId)) {
      costs.set(userId, {
        daily: new Map(),
        monthly: new Map(),
        byModel: new Map(),
        byProvider: new Map(),
        total: 0,
      });
    }
    return costs.get(userId)!;
  };

  const getDateKey = (date?: Date) => {
    const d = date ?? new Date();
    return d.toISOString().split('T')[0]!;
  };

  const getMonthKey = (date?: Date) => {
    const d = date ?? new Date();
    return d.toISOString().slice(0, 7);
  };

  return {
    costs,
    track: (userId, provider, model, cost) => {
      const user = ensureUser(userId);
      const dateKey = getDateKey();
      const monthKey = getMonthKey();

      user.daily.set(dateKey, (user.daily.get(dateKey) ?? 0) + cost);
      user.monthly.set(monthKey, (user.monthly.get(monthKey) ?? 0) + cost);
      user.byModel.set(model, (user.byModel.get(model) ?? 0) + cost);
      user.byProvider.set(provider, (user.byProvider.get(provider) ?? 0) + cost);
      user.total += cost;
    },
    getDailyCost: (userId, date) => {
      const user = costs.get(userId);
      if (!user) return 0;
      const dateKey = date ?? getDateKey();
      return user.daily.get(dateKey) ?? 0;
    },
    getMonthlyCost: (userId, month) => {
      const user = costs.get(userId);
      if (!user) return 0;
      const monthKey = month ?? getMonthKey();
      return user.monthly.get(monthKey) ?? 0;
    },
    getTotalCost: (userId) => costs.get(userId)?.total ?? 0,
    getByModel: (userId) => costs.get(userId)?.byModel ?? new Map(),
    getByProvider: (userId) => costs.get(userId)?.byProvider ?? new Map(),
    reset: (userId) => {
      costs.delete(userId);
    },
  };
}

/**
 * Creates a cost tracking handler with custom pricing
 */
export function createPricedCostHandler(
  pricing: Record<string, { input: number; output: number }>
): HookHandler<CostTrackingInput, CostTrackingOutput> {
  return async (input, _context): Promise<HookResult<CostTrackingOutput>> => {
    const modelPricing = pricing[input.model] ?? DefaultPricing[input.model] ?? { input: 0.001, output: 0.002 };

    const inputCost = (input.inputTokens / 1000) * modelPricing.input;
    const outputCost = (input.outputTokens / 1000) * modelPricing.output;
    const cacheDiscount = input.cached ? 0.9 : 0;
    const totalCost = (inputCost * (1 - cacheDiscount)) + outputCost;

    return {
      success: true,
      data: {
        cost: totalCost,
        currency: 'USD',
      },
      metadata: {
        breakdown: {
          inputCost,
          outputCost,
          cacheDiscount: inputCost * cacheDiscount,
          totalCost,
        },
      },
    };
  };
}

/**
 * Creates a cost tracking handler with budget management
 */
export function createBudgetedCostHandler(
  budget: BudgetConfig,
  tracker?: CostTracker,
  getUserId?: (context: { requestId: string; metadata: Record<string, unknown> }) => string
): HookHandler<CostTrackingInput, CostTrackingOutput> {
  const costTracker = tracker ?? createCostTracker();

  return async (input, context): Promise<HookResult<CostTrackingOutput>> => {
    const userId = getUserId ? getUserId(context) : 'default';
    const pricing = DefaultPricing[input.model] ?? { input: 0.001, output: 0.002 };

    const inputCost = (input.inputTokens / 1000) * pricing.input;
    const outputCost = (input.outputTokens / 1000) * pricing.output;
    const cacheDiscount = input.cached ? 0.9 : 0;
    const totalCost = (inputCost * (1 - cacheDiscount)) + outputCost;

    // Check per-request limit
    if (budget.perRequestLimit && totalCost > budget.perRequestLimit) {
      return {
        success: false,
        error: new Error(`Request cost $${totalCost.toFixed(4)} exceeds limit $${budget.perRequestLimit}`),
        recoverable: false,
      };
    }

    const dailyCost = costTracker.getDailyCost(userId);
    const monthlyCost = costTracker.getMonthlyCost(userId);

    // Check daily limit
    if (budget.dailyLimit && dailyCost + totalCost > budget.dailyLimit) {
      return {
        success: false,
        error: new Error(`Daily budget exhausted: $${dailyCost.toFixed(2)} / $${budget.dailyLimit}`),
        recoverable: false,
      };
    }

    // Check monthly limit
    if (budget.monthlyLimit && monthlyCost + totalCost > budget.monthlyLimit) {
      return {
        success: false,
        error: new Error(`Monthly budget exhausted: $${monthlyCost.toFixed(2)} / $${budget.monthlyLimit}`),
        recoverable: false,
      };
    }

    // Track the cost
    costTracker.track(userId, input.provider, input.model, totalCost);

    // Calculate remaining budget
    const budgetRemaining = budget.monthlyLimit
      ? budget.monthlyLimit - (monthlyCost + totalCost)
      : undefined;

    // Project monthly cost
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const dayOfMonth = new Date().getDate();
    const projectedMonthlyCost = ((monthlyCost + totalCost) / dayOfMonth) * daysInMonth;

    return {
      success: true,
      data: {
        cost: totalCost,
        currency: 'USD',
        budgetRemaining,
        projectedMonthlyCost,
      },
      metadata: {
        dailyCost: dailyCost + totalCost,
        monthlyCost: monthlyCost + totalCost,
      },
    };
  };
}

/**
 * Creates a cost tracking handler with provider aggregation
 */
export function createAggregatingCostHandler(
  tracker?: CostTracker
): HookHandler<CostTrackingInput, CostTrackingOutput> {
  const costTracker = tracker ?? createCostTracker();

  return async (input, context): Promise<HookResult<CostTrackingOutput>> => {
    const userId = (context.metadata['userId'] as string) ?? 'default';
    const pricing = DefaultPricing[input.model] ?? { input: 0.001, output: 0.002 };

    const inputCost = (input.inputTokens / 1000) * pricing.input;
    const outputCost = (input.outputTokens / 1000) * pricing.output;
    const cacheDiscount = input.cached ? 0.9 : 0;
    const totalCost = (inputCost * (1 - cacheDiscount)) + outputCost;

    costTracker.track(userId, input.provider, input.model, totalCost);

    const byProvider = costTracker.getByProvider(userId);
    const byModel = costTracker.getByModel(userId);

    return {
      success: true,
      data: {
        cost: totalCost,
        currency: 'USD',
      },
      metadata: {
        totalCost: costTracker.getTotalCost(userId),
        byProvider: Object.fromEntries(byProvider),
        byModel: Object.fromEntries(byModel),
      },
    };
  };
}

/**
 * Creates a cost tracking handler with reporting
 */
export function createReportingCostHandler(
  reporter: {
    report: (cost: {
      timestamp: number;
      provider: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      cost: number;
      requestId: string;
    }) => void;
  },
  innerHandler?: HookHandler<CostTrackingInput, CostTrackingOutput>
): HookHandler<CostTrackingInput, CostTrackingOutput> {
  return async (input, context): Promise<HookResult<CostTrackingOutput>> => {
    const handler = innerHandler ?? defaultCostTrackingHandler;
    const result = await handler(input, context);

    if (result.success) {
      reporter.report({
        timestamp: context.timestamp,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        cost: result.data.cost,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Creates a cost tracking handler with alerts
 */
export function createAlertingCostHandler(
  thresholds: Array<{
    type: 'daily' | 'monthly' | 'total';
    amount: number;
    callback: (current: number, threshold: number) => void;
  }>,
  tracker?: CostTracker
): HookHandler<CostTrackingInput, CostTrackingOutput> {
  const costTracker = tracker ?? createCostTracker();
  const alertedThresholds = new Set<string>();

  return async (input, context): Promise<HookResult<CostTrackingOutput>> => {
    const userId = (context.metadata['userId'] as string) ?? 'default';
    const pricing = DefaultPricing[input.model] ?? { input: 0.001, output: 0.002 };

    const inputCost = (input.inputTokens / 1000) * pricing.input;
    const outputCost = (input.outputTokens / 1000) * pricing.output;
    const cacheDiscount = input.cached ? 0.9 : 0;
    const totalCost = (inputCost * (1 - cacheDiscount)) + outputCost;

    costTracker.track(userId, input.provider, input.model, totalCost);

    // Check thresholds
    for (const threshold of thresholds) {
      const key = `${userId}:${threshold.type}:${threshold.amount}`;
      if (alertedThresholds.has(key)) continue;

      let current: number;
      switch (threshold.type) {
        case 'daily':
          current = costTracker.getDailyCost(userId);
          break;
        case 'monthly':
          current = costTracker.getMonthlyCost(userId);
          break;
        case 'total':
          current = costTracker.getTotalCost(userId);
          break;
      }

      if (current >= threshold.amount) {
        alertedThresholds.add(key);
        threshold.callback(current, threshold.amount);
      }
    }

    return {
      success: true,
      data: {
        cost: totalCost,
        currency: 'USD',
      },
    };
  };
}

/**
 * Creates a logging cost handler
 */
export function createLoggingCostHandler(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<CostTrackingInput, CostTrackingOutput>
): HookHandler<CostTrackingInput, CostTrackingOutput> {
  return async (input, context): Promise<HookResult<CostTrackingOutput>> => {
    const handler = innerHandler ?? defaultCostTrackingHandler;
    const result = await handler(input, context);

    if (result.success) {
      logger.info(`Cost tracked: $${result.data.cost.toFixed(6)}`, {
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        cost: result.data.cost,
        cached: input.cached,
        budgetRemaining: result.data.budgetRemaining,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default cost tracking hook
 */
export function registerDefaultCostTracking(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.COST_TRACKING,
    {
      id: 'default-cost-tracking',
      name: 'Default Cost Tracking',
      priority: 'normal',
      description: 'Basic cost tracking handler',
    },
    defaultCostTrackingHandler
  );
}

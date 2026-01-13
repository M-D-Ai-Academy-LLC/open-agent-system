/**
 * Fallback Trigger Hook (#5)
 *
 * Determines when to trigger fallback to alternative providers or models.
 * Use cases: graceful degradation, provider failover, model fallback.
 */

import type {
  HookHandler,
  HookResult,
  FallbackTriggerInput,
  FallbackTriggerOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default fallback trigger handler - always fallback if alternatives exist
 */
export const defaultFallbackTriggerHandler: HookHandler<
  FallbackTriggerInput,
  FallbackTriggerOutput
> = async (input, _context): Promise<HookResult<FallbackTriggerOutput>> => {
  if (input.remainingFallbacks.length === 0) {
    return {
      success: true,
      data: {
        shouldFallback: false,
      },
    };
  }

  const nextProvider = input.remainingFallbacks[0];

  return {
    success: true,
    data: {
      shouldFallback: true,
      nextProvider,
      delay: 0,
    },
  };
};

/**
 * Error categories for fallback decision making
 */
type ErrorCategory = 'transient' | 'rate-limit' | 'auth' | 'model' | 'provider' | 'unknown';

function categorizeError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();

  if (message.includes('rate limit') || message.includes('429')) {
    return 'rate-limit';
  }
  if (
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('401') ||
    message.includes('403')
  ) {
    return 'auth';
  }
  if (message.includes('model') || message.includes('not found')) {
    return 'model';
  }
  if (
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('network')
  ) {
    return 'transient';
  }
  if (
    message.includes('unavailable') ||
    message.includes('503') ||
    message.includes('502')
  ) {
    return 'provider';
  }

  return 'unknown';
}

/**
 * Creates a smart fallback trigger that considers error types
 */
export function createSmartFallbackTrigger(config?: {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
}): HookHandler<FallbackTriggerInput, FallbackTriggerOutput> {
  const maxAttempts = config?.maxAttempts ?? 3;
  const baseDelay = config?.delayMs ?? 1000;
  const multiplier = config?.backoffMultiplier ?? 2;

  return async (input, _context): Promise<HookResult<FallbackTriggerOutput>> => {
    // Check if we've exhausted attempts
    if (input.attemptNumber >= maxAttempts) {
      return {
        success: true,
        data: {
          shouldFallback: false,
        },
        metadata: { reason: 'max-attempts-exceeded' },
      };
    }

    // Check if we have fallback options
    if (input.remainingFallbacks.length === 0) {
      return {
        success: true,
        data: {
          shouldFallback: false,
        },
        metadata: { reason: 'no-fallbacks-available' },
      };
    }

    const errorCategory = categorizeError(input.error);

    // Auth errors should not trigger fallback (same creds will fail)
    if (errorCategory === 'auth') {
      return {
        success: false,
        error: input.error,
        recoverable: false,
      };
    }

    // Calculate delay with exponential backoff
    const delay = baseDelay * Math.pow(multiplier, input.attemptNumber - 1);

    // Rate limit errors need longer delay
    const finalDelay = errorCategory === 'rate-limit' ? delay * 2 : delay;

    const nextProvider = input.remainingFallbacks[0];

    return {
      success: true,
      data: {
        shouldFallback: true,
        nextProvider,
        delay: finalDelay,
      },
      metadata: {
        errorCategory,
        attemptNumber: input.attemptNumber,
      },
    };
  };
}

/**
 * Creates a conservative fallback trigger (only for specific errors)
 */
export function createConservativeFallbackTrigger(): HookHandler<
  FallbackTriggerInput,
  FallbackTriggerOutput
> {
  return async (input, _context): Promise<HookResult<FallbackTriggerOutput>> => {
    if (input.remainingFallbacks.length === 0) {
      return {
        success: true,
        data: {
          shouldFallback: false,
        },
      };
    }

    const errorCategory = categorizeError(input.error);

    // Only fallback for transient and provider errors
    const shouldFallback = ['transient', 'provider'].includes(errorCategory);

    if (!shouldFallback) {
      return {
        success: true,
        data: {
          shouldFallback: false,
        },
        metadata: { reason: `error-category-${errorCategory}-not-recoverable` },
      };
    }

    const nextProvider = input.remainingFallbacks[0];

    return {
      success: true,
      data: {
        shouldFallback: true,
        nextProvider,
        delay: 500,
      },
    };
  };
}

/**
 * Creates a fallback trigger with custom error handlers
 */
export function createCustomFallbackTrigger(
  handlers: Partial<Record<ErrorCategory, (input: FallbackTriggerInput) => FallbackTriggerOutput>>
): HookHandler<FallbackTriggerInput, FallbackTriggerOutput> {
  return async (input, _context): Promise<HookResult<FallbackTriggerOutput>> => {
    const errorCategory = categorizeError(input.error);
    const handler = handlers[errorCategory];

    if (handler) {
      return {
        success: true,
        data: handler(input),
        metadata: { errorCategory, handlerUsed: true },
      };
    }

    // Default behavior: fallback if available
    if (input.remainingFallbacks.length === 0) {
      return {
        success: true,
        data: { shouldFallback: false },
      };
    }

    return {
      success: true,
      data: {
        shouldFallback: true,
        nextProvider: input.remainingFallbacks[0],
        delay: 1000,
      },
      metadata: { errorCategory, handlerUsed: false },
    };
  };
}

/**
 * Register the default fallback trigger hook
 */
export function registerDefaultFallbackTrigger(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.FALLBACK_TRIGGER,
    {
      id: 'default-fallback-trigger',
      name: 'Default Fallback Trigger',
      priority: 'normal',
      description: 'Triggers fallback when alternatives are available',
    },
    defaultFallbackTriggerHandler
  );
}

/**
 * Retry Decision Hook (#6)
 *
 * Determines retry logic for failed requests.
 * Use cases: transient error recovery, backoff strategies, request modification.
 */

import type {
  HookHandler,
  HookResult,
  RetryDecisionInput,
  RetryDecisionOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default retry decision handler - simple retry with fixed delay
 */
export const defaultRetryDecisionHandler: HookHandler<
  RetryDecisionInput,
  RetryDecisionOutput
> = async (input, _context): Promise<HookResult<RetryDecisionOutput>> => {
  if (input.attemptNumber >= input.maxAttempts) {
    return {
      success: true,
      data: {
        shouldRetry: false,
        delay: 0,
      },
    };
  }

  return {
    success: true,
    data: {
      shouldRetry: true,
      delay: 1000,
    },
  };
};

/**
 * Check if an error is retryable
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Rate limit errors are retryable after delay
  if (message.includes('rate limit') || message.includes('429')) {
    return true;
  }

  // Network/connection errors are retryable
  if (
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('enotfound')
  ) {
    return true;
  }

  // Server errors are retryable
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  ) {
    return true;
  }

  // Auth errors are NOT retryable
  if (
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('401') ||
    message.includes('403')
  ) {
    return false;
  }

  // Client errors (4xx) are generally not retryable
  if (message.includes('400') || message.includes('404') || message.includes('422')) {
    return false;
  }

  // Default to retryable for unknown errors
  return true;
}

/**
 * Creates an exponential backoff retry strategy
 */
export function createExponentialBackoffRetry(config?: {
  baseDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
  jitter?: boolean;
}): HookHandler<RetryDecisionInput, RetryDecisionOutput> {
  const baseDelay = config?.baseDelayMs ?? 1000;
  const maxDelay = config?.maxDelayMs ?? 30000;
  const multiplier = config?.multiplier ?? 2;
  const jitter = config?.jitter ?? true;

  return async (input, _context): Promise<HookResult<RetryDecisionOutput>> => {
    if (input.attemptNumber >= input.maxAttempts) {
      return {
        success: true,
        data: {
          shouldRetry: false,
          delay: 0,
        },
      };
    }

    if (!isRetryableError(input.error)) {
      return {
        success: true,
        data: {
          shouldRetry: false,
          delay: 0,
        },
        metadata: { reason: 'non-retryable-error' },
      };
    }

    // Calculate delay with exponential backoff
    let delay = baseDelay * Math.pow(multiplier, input.attemptNumber - 1);

    // Add jitter (0-25% of delay)
    if (jitter) {
      delay = delay + Math.random() * delay * 0.25;
    }

    // Cap at max delay
    delay = Math.min(delay, maxDelay);

    return {
      success: true,
      data: {
        shouldRetry: true,
        delay: Math.round(delay),
      },
      metadata: {
        attemptNumber: input.attemptNumber,
        strategy: 'exponential-backoff',
      },
    };
  };
}

/**
 * Creates a linear backoff retry strategy
 */
export function createLinearBackoffRetry(config?: {
  baseDelayMs?: number;
  incrementMs?: number;
  maxDelayMs?: number;
}): HookHandler<RetryDecisionInput, RetryDecisionOutput> {
  const baseDelay = config?.baseDelayMs ?? 1000;
  const increment = config?.incrementMs ?? 1000;
  const maxDelay = config?.maxDelayMs ?? 10000;

  return async (input, _context): Promise<HookResult<RetryDecisionOutput>> => {
    if (input.attemptNumber >= input.maxAttempts) {
      return {
        success: true,
        data: {
          shouldRetry: false,
          delay: 0,
        },
      };
    }

    if (!isRetryableError(input.error)) {
      return {
        success: true,
        data: {
          shouldRetry: false,
          delay: 0,
        },
        metadata: { reason: 'non-retryable-error' },
      };
    }

    const delay = Math.min(baseDelay + increment * (input.attemptNumber - 1), maxDelay);

    return {
      success: true,
      data: {
        shouldRetry: true,
        delay,
      },
      metadata: {
        attemptNumber: input.attemptNumber,
        strategy: 'linear-backoff',
      },
    };
  };
}

/**
 * Creates a retry strategy that modifies the request on retry
 */
export function createAdaptiveRetry(config?: {
  reduceTokensOnRetry?: boolean;
  reduceTokensBy?: number;
  fallbackModel?: string;
}): HookHandler<RetryDecisionInput, RetryDecisionOutput> {
  const reduceTokens = config?.reduceTokensOnRetry ?? false;
  const reduceBy = config?.reduceTokensBy ?? 0.2;
  const fallbackModel = config?.fallbackModel;

  return async (input, _context): Promise<HookResult<RetryDecisionOutput>> => {
    if (input.attemptNumber >= input.maxAttempts) {
      return {
        success: true,
        data: {
          shouldRetry: false,
          delay: 0,
        },
      };
    }

    if (!isRetryableError(input.error)) {
      return {
        success: true,
        data: {
          shouldRetry: false,
          delay: 0,
        },
        metadata: { reason: 'non-retryable-error' },
      };
    }

    // Build modified request
    const modifiedRequest = { ...input.request };

    // Check if error is related to context/tokens
    const isContextError =
      input.error.message.toLowerCase().includes('context') ||
      input.error.message.toLowerCase().includes('token');

    if (isContextError && reduceTokens && modifiedRequest.maxTokens) {
      modifiedRequest.maxTokens = Math.floor(
        modifiedRequest.maxTokens * (1 - reduceBy)
      );
    }

    // On later attempts, consider fallback model
    if (input.attemptNumber >= 2 && fallbackModel) {
      modifiedRequest.model = fallbackModel;
    }

    const delay = 1000 * Math.pow(2, input.attemptNumber - 1);

    return {
      success: true,
      data: {
        shouldRetry: true,
        delay: Math.min(delay, 30000),
        modifiedRequest,
      },
      metadata: {
        attemptNumber: input.attemptNumber,
        strategy: 'adaptive',
        modifications: {
          tokensReduced: isContextError && reduceTokens,
          modelChanged: input.attemptNumber >= 2 && fallbackModel ? true : false,
        },
      },
    };
  };
}

/**
 * Creates a no-retry strategy (fail fast)
 */
export function createNoRetryStrategy(): HookHandler<
  RetryDecisionInput,
  RetryDecisionOutput
> {
  return async (_input, _context): Promise<HookResult<RetryDecisionOutput>> => {
    return {
      success: true,
      data: {
        shouldRetry: false,
        delay: 0,
      },
      metadata: { strategy: 'no-retry' },
    };
  };
}

/**
 * Register the default retry decision hook
 */
export function registerDefaultRetryDecision(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.RETRY_DECISION,
    {
      id: 'default-retry-decision',
      name: 'Default Retry Decision',
      priority: 'normal',
      description: 'Simple retry with fixed 1s delay',
    },
    defaultRetryDecisionHandler
  );
}

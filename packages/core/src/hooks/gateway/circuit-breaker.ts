/**
 * Circuit Breaker Hook (#7)
 *
 * Implements the circuit breaker pattern for provider/model combinations.
 * Use cases: preventing cascading failures, automatic recovery, health monitoring.
 */

import type {
  HookHandler,
  HookResult,
  CircuitBreakerInput,
  CircuitBreakerOutput,
  FailureRecord,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time window in ms to count failures */
  failureWindowMs: number;
  /** Time in ms before attempting to close the circuit */
  cooldownMs: number;
  /** Number of successful requests to close the circuit from half-open */
  successThreshold: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  failureWindowMs: 60000, // 1 minute
  cooldownMs: 30000, // 30 seconds
  successThreshold: 3,
};

/**
 * Default circuit breaker handler - simple threshold-based
 */
export const defaultCircuitBreakerHandler: HookHandler<
  CircuitBreakerInput,
  CircuitBreakerOutput
> = async (input, _context): Promise<HookResult<CircuitBreakerOutput>> => {
  return createConfigurableCircuitBreaker(DEFAULT_CONFIG)(input, _context);
};

/**
 * Creates a configurable circuit breaker
 */
export function createConfigurableCircuitBreaker(
  config: Partial<CircuitBreakerConfig> = {}
): HookHandler<CircuitBreakerInput, CircuitBreakerOutput> {
  const fullConfig: CircuitBreakerConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  return async (input, _context): Promise<HookResult<CircuitBreakerOutput>> => {
    const { currentState, recentFailures } = input;
    const now = Date.now();

    // Count recent failures within the window
    const recentFailureCount = countRecentFailures(
      recentFailures,
      fullConfig.failureWindowMs
    );

    switch (currentState) {
      case 'closed': {
        // Circuit is healthy, check if it should open
        if (recentFailureCount >= fullConfig.failureThreshold) {
          return {
            success: true,
            data: {
              newState: 'open',
              allowRequest: false,
              cooldownMs: fullConfig.cooldownMs,
            },
            metadata: {
              reason: 'failure-threshold-exceeded',
              failureCount: recentFailureCount,
              threshold: fullConfig.failureThreshold,
            },
          };
        }

        return {
          success: true,
          data: {
            newState: 'closed',
            allowRequest: true,
          },
          metadata: {
            failureCount: recentFailureCount,
          },
        };
      }

      case 'open': {
        // Circuit is open, check if cooldown has passed
        const lastFailure = getLastFailure(recentFailures);
        const timeSinceLastFailure = lastFailure ? now - lastFailure.timestamp : Infinity;

        if (timeSinceLastFailure >= fullConfig.cooldownMs) {
          return {
            success: true,
            data: {
              newState: 'half-open',
              allowRequest: true,
            },
            metadata: {
              reason: 'cooldown-expired',
              timeSinceLastFailure,
            },
          };
        }

        return {
          success: true,
          data: {
            newState: 'open',
            allowRequest: false,
            cooldownMs: fullConfig.cooldownMs - timeSinceLastFailure,
          },
          metadata: {
            reason: 'cooldown-in-progress',
            remainingCooldown: fullConfig.cooldownMs - timeSinceLastFailure,
          },
        };
      }

      case 'half-open': {
        // Circuit is testing, allow the request
        // The caller is responsible for tracking success/failure and transitioning
        return {
          success: true,
          data: {
            newState: 'half-open',
            allowRequest: true,
          },
          metadata: {
            reason: 'testing-request',
            successThreshold: fullConfig.successThreshold,
          },
        };
      }

      default:
        return {
          success: false,
          error: new Error(`Unknown circuit breaker state: ${currentState}`),
          recoverable: false,
        };
    }
  };
}

/**
 * Creates a sliding window circuit breaker with percentage-based thresholds
 */
export function createSlidingWindowCircuitBreaker(config?: {
  windowSizeMs?: number;
  failurePercentageThreshold?: number;
  minimumRequests?: number;
  cooldownMs?: number;
}): HookHandler<CircuitBreakerInput, CircuitBreakerOutput> {
  const windowSize = config?.windowSizeMs ?? 60000;
  const failureThreshold = config?.failurePercentageThreshold ?? 50;
  const minRequests = config?.minimumRequests ?? 10;
  const cooldownMs = config?.cooldownMs ?? 30000;

  // Track requests internally
  const requestHistory: { timestamp: number; success: boolean }[] = [];

  return async (input, _context): Promise<HookResult<CircuitBreakerOutput>> => {
    const now = Date.now();

    // Clean old entries
    while (requestHistory.length > 0 && now - requestHistory[0]!.timestamp > windowSize) {
      requestHistory.shift();
    }

    // Add recent failures to history
    for (const failure of input.recentFailures) {
      if (
        now - failure.timestamp <= windowSize &&
        !requestHistory.some((r) => r.timestamp === failure.timestamp)
      ) {
        requestHistory.push({ timestamp: failure.timestamp, success: false });
      }
    }

    const totalRequests = requestHistory.length;
    const failedRequests = requestHistory.filter((r) => !r.success).length;
    const failurePercentage = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;

    switch (input.currentState) {
      case 'closed': {
        // Only check threshold if we have minimum requests
        if (totalRequests >= minRequests && failurePercentage >= failureThreshold) {
          return {
            success: true,
            data: {
              newState: 'open',
              allowRequest: false,
              cooldownMs,
            },
            metadata: {
              reason: 'failure-percentage-exceeded',
              failurePercentage,
              totalRequests,
            },
          };
        }

        return {
          success: true,
          data: {
            newState: 'closed',
            allowRequest: true,
          },
          metadata: { failurePercentage, totalRequests },
        };
      }

      case 'open': {
        const lastFailure = getLastFailure(input.recentFailures);
        const timeSinceLastFailure = lastFailure ? now - lastFailure.timestamp : Infinity;

        if (timeSinceLastFailure >= cooldownMs) {
          return {
            success: true,
            data: {
              newState: 'half-open',
              allowRequest: true,
            },
          };
        }

        return {
          success: true,
          data: {
            newState: 'open',
            allowRequest: false,
            cooldownMs: cooldownMs - timeSinceLastFailure,
          },
        };
      }

      case 'half-open': {
        return {
          success: true,
          data: {
            newState: 'half-open',
            allowRequest: true,
          },
        };
      }

      default:
        return {
          success: false,
          error: new Error(`Unknown state: ${input.currentState}`),
          recoverable: false,
        };
    }
  };
}

/**
 * Creates a circuit breaker that never opens (always allow requests)
 */
export function createAlwaysClosedCircuitBreaker(): HookHandler<
  CircuitBreakerInput,
  CircuitBreakerOutput
> {
  return async (_input, _context): Promise<HookResult<CircuitBreakerOutput>> => {
    return {
      success: true,
      data: {
        newState: 'closed',
        allowRequest: true,
      },
      metadata: { strategy: 'always-closed' },
    };
  };
}

/**
 * Helper function to count recent failures within a time window
 */
function countRecentFailures(failures: FailureRecord[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return failures.filter((f) => f.timestamp >= cutoff).length;
}

/**
 * Helper function to get the most recent failure
 */
function getLastFailure(failures: FailureRecord[]): FailureRecord | undefined {
  if (failures.length === 0) return undefined;
  return failures.reduce((latest, current) =>
    current.timestamp > latest.timestamp ? current : latest
  );
}

/**
 * Register the default circuit breaker hook
 */
export function registerDefaultCircuitBreaker(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.CIRCUIT_BREAKER,
    {
      id: 'default-circuit-breaker',
      name: 'Default Circuit Breaker',
      priority: 'normal',
      description: 'Threshold-based circuit breaker with 5 failures in 1 minute',
    },
    defaultCircuitBreakerHandler
  );
}

/**
 * Tool Error Recovery Hook (#19)
 *
 * Handles tool execution errors with recovery strategies.
 * Use cases: error handling, fallback execution, graceful degradation.
 */

import type {
  HookHandler,
  HookResult,
  ToolErrorRecoveryInput,
  ToolErrorRecoveryOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default tool error recovery handler - report the error
 */
export const defaultToolErrorRecoveryHandler: HookHandler<
  ToolErrorRecoveryInput,
  ToolErrorRecoveryOutput
> = async (input, _context): Promise<HookResult<ToolErrorRecoveryOutput>> => {
  return {
    success: true,
    data: {
      recovered: false,
      userMessage: `Tool execution failed: ${input.error.message}`,
    },
  };
};

/**
 * Recovery strategy type
 */
export type RecoveryStrategy = 'retry' | 'fallback' | 'abort' | 'ignore';

/**
 * Error classification for recovery decisions
 */
export interface ErrorClassification {
  category: 'transient' | 'permanent' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  retryable: boolean;
}

/**
 * Creates an error recovery handler with strategy selection
 */
export function createStrategyBasedRecovery(
  strategies: Map<string, RecoveryStrategy>,
  defaultStrategy: RecoveryStrategy = 'abort'
): HookHandler<ToolErrorRecoveryInput, ToolErrorRecoveryOutput> {
  return async (input, _context): Promise<HookResult<ToolErrorRecoveryOutput>> => {
    const strategy = strategies.get(input.toolId) ?? defaultStrategy;

    switch (strategy) {
      case 'ignore':
        return {
          success: true,
          data: {
            recovered: true,
            result: null,
          },
        };

      case 'fallback':
        return {
          success: true,
          data: {
            recovered: false,
            userMessage: `Tool ${input.toolId} failed, fallback required`,
          },
          metadata: { needsFallback: true },
        };

      case 'retry':
        return {
          success: true,
          data: {
            recovered: false,
            userMessage: `Tool ${input.toolId} failed, retry suggested`,
          },
          metadata: { shouldRetry: true },
        };

      case 'abort':
      default:
        return {
          success: true,
          data: {
            recovered: false,
            userMessage: input.error.message,
          },
        };
    }
  };
}

/**
 * Creates an error recovery handler with fallback tools
 */
export function createFallbackRecovery(
  fallbacks: Map<string, string>
): HookHandler<ToolErrorRecoveryInput, ToolErrorRecoveryOutput> {
  return async (input, _context): Promise<HookResult<ToolErrorRecoveryOutput>> => {
    const fallbackTool = fallbacks.get(input.toolId);

    if (!fallbackTool) {
      return {
        success: true,
        data: {
          recovered: false,
          userMessage: input.error.message,
        },
      };
    }

    return {
      success: true,
      data: {
        recovered: false,
        fallbackTool,
        userMessage: `Primary tool failed, using fallback: ${fallbackTool}`,
      },
    };
  };
}

/**
 * Creates an error recovery handler with error classification
 */
export function createClassifiedRecovery(
  classifier: (error: Error, toolId: string) => ErrorClassification,
  maxRetries: number = 3
): HookHandler<ToolErrorRecoveryInput, ToolErrorRecoveryOutput> {
  return async (input, _context): Promise<HookResult<ToolErrorRecoveryOutput>> => {
    const classification = classifier(input.error, input.toolId);

    // Check if we've exceeded retry limit
    if (input.attemptNumber >= maxRetries) {
      return {
        success: true,
        data: {
          recovered: false,
          userMessage: `Max retries (${maxRetries}) exceeded: ${input.error.message}`,
        },
        metadata: { classification },
      };
    }

    // Transient errors are retryable
    if (classification.category === 'transient' && classification.retryable) {
      return {
        success: true,
        data: {
          recovered: false,
          userMessage: `Transient error, retry recommended`,
        },
        metadata: {
          classification,
          shouldRetry: true,
          attemptNumber: input.attemptNumber,
        },
      };
    }

    // Low severity errors can be recovered with null
    if (classification.severity === 'low') {
      return {
        success: true,
        data: {
          recovered: true,
          result: null,
          userMessage: 'Low severity error, continuing with null result',
        },
        metadata: { classification },
      };
    }

    return {
      success: true,
      data: {
        recovered: false,
        userMessage: input.error.message,
      },
      metadata: { classification },
    };
  };
}

/**
 * Default error classifier
 */
export function createDefaultErrorClassifier(): (
  error: Error,
  toolId: string
) => ErrorClassification {
  return (error: Error, _toolId: string): ErrorClassification => {
    const message = error.message.toLowerCase();

    // Transient errors
    if (
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('rate limit') ||
      message.includes('503') ||
      message.includes('429')
    ) {
      return {
        category: 'transient',
        severity: 'medium',
        retryable: true,
      };
    }

    // Authentication errors - permanent
    if (
      message.includes('401') ||
      message.includes('403') ||
      message.includes('unauthorized')
    ) {
      return {
        category: 'permanent',
        severity: 'high',
        retryable: false,
      };
    }

    // Not found errors - permanent
    if (message.includes('404') || message.includes('not found')) {
      return {
        category: 'permanent',
        severity: 'medium',
        retryable: false,
      };
    }

    // Validation errors - permanent
    if (message.includes('invalid') || message.includes('400')) {
      return {
        category: 'permanent',
        severity: 'low',
        retryable: false,
      };
    }

    // Unknown errors
    return {
      category: 'unknown',
      severity: 'medium',
      retryable: false,
    };
  };
}

/**
 * Creates an error recovery handler with logging
 */
export function createLoggingRecovery(
  logger: {
    error: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<ToolErrorRecoveryInput, ToolErrorRecoveryOutput>
): HookHandler<ToolErrorRecoveryInput, ToolErrorRecoveryOutput> {
  return async (input, context): Promise<HookResult<ToolErrorRecoveryOutput>> => {
    logger.error(`Tool execution failed: ${input.toolId}`, {
      toolId: input.toolId,
      error: input.error.message,
      errorStack: input.error.stack,
      arguments: input.arguments,
      requestId: context.requestId,
      attemptNumber: input.attemptNumber,
    });

    if (innerHandler) {
      return innerHandler(input, context);
    }

    return {
      success: true,
      data: {
        recovered: false,
        userMessage: input.error.message,
      },
    };
  };
}

/**
 * Creates a composite recovery handler that tries multiple strategies
 */
export function createCompositeRecovery(
  handlers: HookHandler<ToolErrorRecoveryInput, ToolErrorRecoveryOutput>[]
): HookHandler<ToolErrorRecoveryInput, ToolErrorRecoveryOutput> {
  return async (input, context): Promise<HookResult<ToolErrorRecoveryOutput>> => {
    for (const handler of handlers) {
      const result = await handler(input, context);

      if (!result.success) {
        continue;
      }

      // If recovered or has fallback, use this result
      if (result.data.recovered || result.data.fallbackTool) {
        return result;
      }
    }

    // No handler could recover
    return {
      success: true,
      data: {
        recovered: false,
        userMessage: input.error.message,
      },
    };
  };
}

/**
 * Register the default tool error recovery hook
 */
export function registerDefaultToolErrorRecovery(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.TOOL_ERROR_RECOVERY,
    {
      id: 'default-tool-error-recovery',
      name: 'Default Tool Error Recovery',
      priority: 'normal',
      description: 'Basic error reporting handler',
    },
    defaultToolErrorRecoveryHandler
  );
}

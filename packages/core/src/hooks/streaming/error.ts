/**
 * Stream Error Hook (#32)
 *
 * Handles streaming errors and recovery.
 * Use cases: error handling, partial recovery, graceful degradation.
 */

import type {
  HookHandler,
  HookResult,
  StreamErrorInput,
  StreamErrorOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default stream error handler - abort on error
 */
export const defaultStreamErrorHandler: HookHandler<
  StreamErrorInput,
  StreamErrorOutput
> = async (input, _context): Promise<HookResult<StreamErrorOutput>> => {
  return {
    success: true,
    data: {
      handled: true,
      recovery: 'abort',
      userMessage: `Stream error: ${input.error.message}`,
    },
  };
};

/**
 * Error classification for streams
 */
export interface StreamErrorClassification {
  category: 'network' | 'timeout' | 'rate-limit' | 'content' | 'server' | 'unknown';
  recoverable: boolean;
  suggestedRecovery: 'resume' | 'restart' | 'abort';
}

/**
 * Default stream error classifier
 */
export function classifyStreamError(error: Error): StreamErrorClassification {
  const message = error.message.toLowerCase();

  if (message.includes('timeout') || message.includes('etimedout')) {
    return {
      category: 'timeout',
      recoverable: true,
      suggestedRecovery: 'resume',
    };
  }

  if (message.includes('network') || message.includes('econnreset') || message.includes('econnrefused')) {
    return {
      category: 'network',
      recoverable: true,
      suggestedRecovery: 'resume',
    };
  }

  if (message.includes('rate') || message.includes('429')) {
    return {
      category: 'rate-limit',
      recoverable: true,
      suggestedRecovery: 'restart',
    };
  }

  if (message.includes('500') || message.includes('502') || message.includes('503')) {
    return {
      category: 'server',
      recoverable: true,
      suggestedRecovery: 'restart',
    };
  }

  if (message.includes('content') || message.includes('parse') || message.includes('invalid')) {
    return {
      category: 'content',
      recoverable: false,
      suggestedRecovery: 'abort',
    };
  }

  return {
    category: 'unknown',
    recoverable: false,
    suggestedRecovery: 'abort',
  };
}

/**
 * Creates a stream error handler with classification-based recovery
 */
export function createClassifiedErrorHandler(): HookHandler<StreamErrorInput, StreamErrorOutput> {
  return async (input, _context): Promise<HookResult<StreamErrorOutput>> => {
    const classification = classifyStreamError(input.error);

    let userMessage: string;
    switch (classification.category) {
      case 'network':
        userMessage = 'Network connection interrupted. Attempting to resume...';
        break;
      case 'timeout':
        userMessage = 'Response timeout. Attempting to resume...';
        break;
      case 'rate-limit':
        userMessage = 'Rate limit reached. Retrying shortly...';
        break;
      case 'server':
        userMessage = 'Server error. Retrying request...';
        break;
      case 'content':
        userMessage = 'Invalid content received. Unable to continue.';
        break;
      default:
        userMessage = `Stream error: ${input.error.message}`;
    }

    return {
      success: true,
      data: {
        handled: true,
        recovery: classification.suggestedRecovery,
        userMessage,
      },
      metadata: {
        classification,
      },
    };
  };
}

/**
 * Creates a stream error handler with partial content salvage
 */
export function createPartialSalvageErrorHandler(
  minContentLength: number = 100
): HookHandler<StreamErrorInput, StreamErrorOutput> {
  return async (input, _context): Promise<HookResult<StreamErrorOutput>> => {
    // If we have substantial partial content, try to salvage it
    if (input.partialContent && input.partialContent.length >= minContentLength) {
      return {
        success: true,
        data: {
          handled: true,
          recovery: 'abort',
          userMessage: 'Stream interrupted, but partial content was saved.',
        },
        metadata: {
          salvaged: true,
          salvageLength: input.partialContent.length,
          chunksReceived: input.chunksReceived,
        },
      };
    }

    // Not enough content to salvage
    return {
      success: true,
      data: {
        handled: true,
        recovery: 'restart',
        userMessage: 'Stream interrupted early. Restarting...',
      },
      metadata: {
        salvaged: false,
        chunksReceived: input.chunksReceived,
      },
    };
  };
}

/**
 * Creates a stream error handler with retry logic
 */
export function createRetryErrorHandler(
  maxRetries: number = 3,
  retryTracker: {
    getRetryCount: (streamId: string) => number;
    incrementRetryCount: (streamId: string) => number;
    resetRetryCount: (streamId: string) => void;
  }
): HookHandler<StreamErrorInput, StreamErrorOutput> {
  return async (input, _context): Promise<HookResult<StreamErrorOutput>> => {
    const classification = classifyStreamError(input.error);

    if (!classification.recoverable) {
      retryTracker.resetRetryCount(input.streamId);
      return {
        success: true,
        data: {
          handled: true,
          recovery: 'abort',
          userMessage: `Unrecoverable error: ${input.error.message}`,
        },
      };
    }

    const retryCount = retryTracker.incrementRetryCount(input.streamId);

    if (retryCount > maxRetries) {
      retryTracker.resetRetryCount(input.streamId);
      return {
        success: true,
        data: {
          handled: true,
          recovery: 'abort',
          userMessage: `Max retries (${maxRetries}) exceeded. Aborting.`,
        },
        metadata: {
          retryCount,
          maxRetries,
        },
      };
    }

    return {
      success: true,
      data: {
        handled: true,
        recovery: classification.suggestedRecovery,
        userMessage: `Retry ${retryCount}/${maxRetries}: ${input.error.message}`,
      },
      metadata: {
        retryCount,
        maxRetries,
        classification,
      },
    };
  };
}

/**
 * Creates a stream error handler with logging
 */
export function createLoggingErrorHandler(
  logger: {
    error: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<StreamErrorInput, StreamErrorOutput>
): HookHandler<StreamErrorInput, StreamErrorOutput> {
  return async (input, context): Promise<HookResult<StreamErrorOutput>> => {
    const classification = classifyStreamError(input.error);

    if (classification.recoverable) {
      logger.warn(`Stream error (recoverable): ${input.streamId}`, {
        streamId: input.streamId,
        error: input.error.message,
        chunksReceived: input.chunksReceived,
        category: classification.category,
        requestId: context.requestId,
      });
    } else {
      logger.error(`Stream error (unrecoverable): ${input.streamId}`, {
        streamId: input.streamId,
        error: input.error.message,
        errorStack: input.error.stack,
        chunksReceived: input.chunksReceived,
        partialContentLength: input.partialContent?.length,
        requestId: context.requestId,
      });
    }

    const handler = innerHandler ?? defaultStreamErrorHandler;
    return handler(input, context);
  };
}

/**
 * Creates a composite error handler
 */
export function createCompositeErrorHandler(
  handlers: HookHandler<StreamErrorInput, StreamErrorOutput>[]
): HookHandler<StreamErrorInput, StreamErrorOutput> {
  return async (input, context): Promise<HookResult<StreamErrorOutput>> => {
    for (const handler of handlers) {
      const result = await handler(input, context);

      if (result.success && result.data.recovery !== 'abort') {
        return result;
      }
    }

    // All handlers suggest abort
    return {
      success: true,
      data: {
        handled: true,
        recovery: 'abort',
        userMessage: input.error.message,
      },
    };
  };
}

/**
 * Register the default stream error hook
 */
export function registerDefaultStreamError(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.STREAM_ERROR,
    {
      id: 'default-stream-error',
      name: 'Default Stream Error',
      priority: 'normal',
      description: 'Basic stream error handler',
    },
    defaultStreamErrorHandler
  );
}

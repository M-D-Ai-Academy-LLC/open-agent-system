/**
 * Backpressure Hook (#33)
 *
 * Manages flow control for streaming.
 * Use cases: buffer management, rate limiting, consumer pacing.
 */

import type {
  HookHandler,
  HookResult,
  BackpressureInput,
  BackpressureOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default backpressure handler - continue unless buffer is very full
 */
export const defaultBackpressureHandler: HookHandler<
  BackpressureInput,
  BackpressureOutput
> = async (input, _context): Promise<HookResult<BackpressureOutput>> => {
  if (input.bufferUtilization > 0.9) {
    return {
      success: true,
      data: {
        action: 'pause',
        bufferAction: 'flush',
      },
    };
  }

  if (input.bufferUtilization > 0.7) {
    return {
      success: true,
      data: {
        action: 'slow',
        targetRate: input.processingRate,
      },
    };
  }

  return {
    success: true,
    data: {
      action: 'continue',
    },
  };
};

/**
 * Backpressure thresholds configuration
 */
export interface BackpressureThresholds {
  pauseThreshold: number;
  slowThreshold: number;
  expandThreshold: number;
  dropThreshold: number;
}

/**
 * Default backpressure thresholds
 */
export const DEFAULT_BACKPRESSURE_THRESHOLDS: BackpressureThresholds = {
  pauseThreshold: 0.95,
  slowThreshold: 0.75,
  expandThreshold: 0.5,
  dropThreshold: 0.99,
};

/**
 * Creates a backpressure handler with configurable thresholds
 */
export function createThresholdBackpressure(
  thresholds: BackpressureThresholds = DEFAULT_BACKPRESSURE_THRESHOLDS
): HookHandler<BackpressureInput, BackpressureOutput> {
  return async (input, _context): Promise<HookResult<BackpressureOutput>> => {
    const { bufferUtilization, processingRate, incomingRate } = input;

    // Critical - drop data to prevent overflow
    if (bufferUtilization >= thresholds.dropThreshold) {
      return {
        success: true,
        data: {
          action: 'drop',
          bufferAction: 'flush',
        },
      };
    }

    // Very high - pause incoming
    if (bufferUtilization >= thresholds.pauseThreshold) {
      return {
        success: true,
        data: {
          action: 'pause',
          bufferAction: 'flush',
        },
      };
    }

    // High - slow down incoming
    if (bufferUtilization >= thresholds.slowThreshold) {
      // Calculate target rate to match processing
      const targetRate = Math.min(processingRate, incomingRate * 0.5);

      return {
        success: true,
        data: {
          action: 'slow',
          targetRate,
          bufferAction: 'maintain',
        },
      };
    }

    // Low - consider expanding buffer if incoming rate is high
    if (bufferUtilization <= thresholds.expandThreshold && incomingRate > processingRate * 1.5) {
      return {
        success: true,
        data: {
          action: 'continue',
          bufferAction: 'expand',
        },
      };
    }

    return {
      success: true,
      data: {
        action: 'continue',
        bufferAction: 'maintain',
      },
    };
  };
}

/**
 * Creates a backpressure handler with adaptive rate control
 */
export function createAdaptiveBackpressure(
  targetUtilization: number = 0.6,
  adjustmentFactor: number = 0.1
): HookHandler<BackpressureInput, BackpressureOutput> {
  return async (input, _context): Promise<HookResult<BackpressureOutput>> => {
    const { bufferUtilization, processingRate, incomingRate } = input;

    // Calculate deviation from target
    const deviation = bufferUtilization - targetUtilization;

    // If we're close to target, continue as normal
    if (Math.abs(deviation) < 0.1) {
      return {
        success: true,
        data: {
          action: 'continue',
          targetRate: incomingRate,
          bufferAction: 'maintain',
        },
      };
    }

    // Adjust rate based on deviation
    const adjustment = 1 - (deviation * adjustmentFactor);
    const targetRate = Math.max(0, incomingRate * adjustment);

    // Determine action based on deviation
    let action: 'continue' | 'slow' | 'pause' | 'drop';

    if (deviation > 0.35) {
      action = 'pause';
    } else if (deviation > 0.15) {
      action = 'slow';
    } else if (deviation < -0.3) {
      action = 'continue';
    } else {
      action = 'continue';
    }

    // Determine buffer action
    let bufferAction: 'expand' | 'flush' | 'maintain';

    if (deviation > 0.3) {
      bufferAction = 'flush';
    } else if (deviation < -0.2 && incomingRate > processingRate) {
      bufferAction = 'expand';
    } else {
      bufferAction = 'maintain';
    }

    return {
      success: true,
      data: {
        action,
        targetRate,
        bufferAction,
      },
      metadata: {
        deviation,
        adjustment,
      },
    };
  };
}

/**
 * Creates a backpressure handler with windowed averaging
 */
export function createWindowedBackpressure(
  windowSize: number = 10
): {
  handler: HookHandler<BackpressureInput, BackpressureOutput>;
  getWindowStats: (streamId: string) => {
    avgUtilization: number;
    avgProcessingRate: number;
    avgIncomingRate: number;
  } | undefined;
} {
  const windows = new Map<string, {
    utilizations: number[];
    processingRates: number[];
    incomingRates: number[];
  }>();

  const getWindow = (streamId: string) => {
    let window = windows.get(streamId);
    if (!window) {
      window = {
        utilizations: [],
        processingRates: [],
        incomingRates: [],
      };
      windows.set(streamId, window);
    }
    return window;
  };

  const addToWindow = (arr: number[], value: number) => {
    arr.push(value);
    if (arr.length > windowSize) {
      arr.shift();
    }
  };

  const average = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const handler: HookHandler<BackpressureInput, BackpressureOutput> = async (
    input,
    _context
  ): Promise<HookResult<BackpressureOutput>> => {
    const window = getWindow(input.streamId);

    addToWindow(window.utilizations, input.bufferUtilization);
    addToWindow(window.processingRates, input.processingRate);
    addToWindow(window.incomingRates, input.incomingRate);

    const avgUtilization = average(window.utilizations);
    const avgProcessingRate = average(window.processingRates);
    const avgIncomingRate = average(window.incomingRates);

    // Make decisions based on averaged values
    if (avgUtilization > 0.9) {
      return {
        success: true,
        data: {
          action: 'pause',
          bufferAction: 'flush',
        },
        metadata: {
          avgUtilization,
          windowSize: window.utilizations.length,
        },
      };
    }

    if (avgUtilization > 0.7) {
      return {
        success: true,
        data: {
          action: 'slow',
          targetRate: avgProcessingRate,
          bufferAction: 'maintain',
        },
        metadata: {
          avgUtilization,
        },
      };
    }

    // Check if incoming consistently exceeds processing
    if (avgIncomingRate > avgProcessingRate * 1.5 && avgUtilization > 0.5) {
      return {
        success: true,
        data: {
          action: 'slow',
          targetRate: avgProcessingRate,
          bufferAction: 'expand',
        },
        metadata: {
          rateMismatch: avgIncomingRate / avgProcessingRate,
        },
      };
    }

    return {
      success: true,
      data: {
        action: 'continue',
        bufferAction: 'maintain',
      },
    };
  };

  const getWindowStats = (streamId: string) => {
    const window = windows.get(streamId);
    if (!window) return undefined;

    return {
      avgUtilization: average(window.utilizations),
      avgProcessingRate: average(window.processingRates),
      avgIncomingRate: average(window.incomingRates),
    };
  };

  return { handler, getWindowStats };
}

/**
 * Creates a backpressure handler with logging
 */
export function createLoggingBackpressure(
  logger: {
    debug: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<BackpressureInput, BackpressureOutput>
): HookHandler<BackpressureInput, BackpressureOutput> {
  return async (input, context): Promise<HookResult<BackpressureOutput>> => {
    const handler = innerHandler ?? defaultBackpressureHandler;
    const result = await handler(input, context);

    if (result.success) {
      if (result.data.action !== 'continue') {
        logger.warn(`Backpressure action: ${result.data.action}`, {
          streamId: input.streamId,
          action: result.data.action,
          bufferUtilization: input.bufferUtilization,
          processingRate: input.processingRate,
          incomingRate: input.incomingRate,
          targetRate: result.data.targetRate,
          bufferAction: result.data.bufferAction,
        });
      } else {
        logger.debug(`Backpressure: continue`, {
          streamId: input.streamId,
          bufferUtilization: input.bufferUtilization,
        });
      }
    }

    return result;
  };
}

/**
 * Register the default backpressure hook
 */
export function registerDefaultBackpressure(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.BACKPRESSURE,
    {
      id: 'default-backpressure',
      name: 'Default Backpressure',
      priority: 'normal',
      description: 'Basic backpressure handler',
    },
    defaultBackpressureHandler
  );
}

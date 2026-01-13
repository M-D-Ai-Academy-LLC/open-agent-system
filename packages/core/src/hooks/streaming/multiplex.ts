/**
 * Stream Multiplex Hook (#34)
 *
 * Manages multiple concurrent streams.
 * Use cases: parallel processing, stream merging, resource allocation.
 */

import type {
  HookHandler,
  HookResult,
  StreamMultiplexInput,
  StreamMultiplexOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default stream multiplex handler
 */
export const defaultStreamMultiplexHandler: HookHandler<
  StreamMultiplexInput,
  StreamMultiplexOutput
> = async (input, context): Promise<HookResult<StreamMultiplexOutput>> => {
  const multiplexId = `mux-${context.requestId}-${Date.now()}`;

  // Default buffer allocation - equal distribution
  const bufferPerStream = Math.floor(16384 / input.streams.length);
  const bufferAllocations: Record<string, number> = {};

  for (const streamId of input.streams) {
    bufferAllocations[streamId] = bufferPerStream;
  }

  return {
    success: true,
    data: {
      multiplexId,
      streamOrder: input.streams,
      bufferAllocations,
    },
  };
};

/**
 * Multiplex registry for tracking active multiplexed streams
 */
export interface MultiplexRegistry {
  multiplexes: Map<string, {
    streams: string[];
    strategy: 'interleave' | 'sequential' | 'priority';
    bufferAllocations: Record<string, number>;
    currentIndex: number;
    status: 'active' | 'completing' | 'completed';
  }>;
  register: (multiplexId: string, streams: string[], strategy: 'interleave' | 'sequential' | 'priority') => void;
  setBufferAllocations: (multiplexId: string, allocations: Record<string, number>) => void;
  getNextStream: (multiplexId: string) => string | undefined;
  complete: (multiplexId: string) => void;
  isActive: (multiplexId: string) => boolean;
}

/**
 * Creates a multiplex registry
 */
export function createMultiplexRegistry(): MultiplexRegistry {
  const multiplexes = new Map<string, {
    streams: string[];
    strategy: 'interleave' | 'sequential' | 'priority';
    bufferAllocations: Record<string, number>;
    currentIndex: number;
    status: 'active' | 'completing' | 'completed';
  }>();

  return {
    multiplexes,
    register: (multiplexId, streams, strategy) => {
      multiplexes.set(multiplexId, {
        streams,
        strategy,
        bufferAllocations: {},
        currentIndex: 0,
        status: 'active',
      });
    },
    setBufferAllocations: (multiplexId, allocations) => {
      const mux = multiplexes.get(multiplexId);
      if (mux) {
        mux.bufferAllocations = allocations;
      }
    },
    getNextStream: (multiplexId) => {
      const mux = multiplexes.get(multiplexId);
      if (!mux || mux.streams.length === 0) return undefined;

      switch (mux.strategy) {
        case 'sequential':
          if (mux.currentIndex < mux.streams.length) {
            return mux.streams[mux.currentIndex];
          }
          return undefined;

        case 'interleave':
          const stream = mux.streams[mux.currentIndex % mux.streams.length];
          mux.currentIndex++;
          return stream;

        case 'priority':
          // Priority always returns first available
          return mux.streams[0];
      }
    },
    complete: (multiplexId) => {
      const mux = multiplexes.get(multiplexId);
      if (mux) {
        mux.status = 'completed';
      }
    },
    isActive: (multiplexId) => {
      const mux = multiplexes.get(multiplexId);
      return mux?.status === 'active';
    },
  };
}

/**
 * Creates a multiplex handler with priority-based ordering
 */
export function createPriorityMultiplex(
  prioritySource: {
    getPriority: (streamId: string) => number;
  }
): HookHandler<StreamMultiplexInput, StreamMultiplexOutput> {
  return async (input, context): Promise<HookResult<StreamMultiplexOutput>> => {
    const multiplexId = `mux-${context.requestId}-${Date.now()}`;

    // Sort streams by priority (lower number = higher priority)
    const streamOrder = [...input.streams].sort((a, b) => {
      const priorityA = prioritySource.getPriority(a);
      const priorityB = prioritySource.getPriority(b);
      return priorityA - priorityB;
    });

    // Allocate more buffer to higher priority streams
    const totalBuffer = 65536;
    const bufferAllocations: Record<string, number> = {};

    // Weight by inverse priority
    const weights = streamOrder.map((_, i) => Math.pow(0.7, i));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    for (let i = 0; i < streamOrder.length; i++) {
      bufferAllocations[streamOrder[i]!] = Math.floor((weights[i]! / totalWeight) * totalBuffer);
    }

    return {
      success: true,
      data: {
        multiplexId,
        streamOrder,
        bufferAllocations,
      },
      metadata: {
        strategy: 'priority',
      },
    };
  };
}

/**
 * Creates a multiplex handler with fair scheduling
 */
export function createFairMultiplex(
  totalBuffer: number = 65536
): HookHandler<StreamMultiplexInput, StreamMultiplexOutput> {
  return async (input, context): Promise<HookResult<StreamMultiplexOutput>> => {
    const multiplexId = `mux-${context.requestId}-${Date.now()}`;

    // Equal buffer allocation
    const bufferPerStream = Math.floor(totalBuffer / input.streams.length);
    const bufferAllocations: Record<string, number> = {};

    for (const streamId of input.streams) {
      bufferAllocations[streamId] = bufferPerStream;
    }

    // Interleave order - round robin
    const streamOrder = [...input.streams];

    return {
      success: true,
      data: {
        multiplexId,
        streamOrder,
        bufferAllocations,
      },
      metadata: {
        strategy: 'fair',
        bufferPerStream,
      },
    };
  };
}

/**
 * Creates a multiplex handler with adaptive buffer allocation
 */
export function createAdaptiveMultiplex(
  rateTracker: {
    getRate: (streamId: string) => number;
    getTotalRate: () => number;
  },
  totalBuffer: number = 65536
): HookHandler<StreamMultiplexInput, StreamMultiplexOutput> {
  return async (input, context): Promise<HookResult<StreamMultiplexOutput>> => {
    const multiplexId = `mux-${context.requestId}-${Date.now()}`;

    // Allocate buffer proportional to incoming rate
    const totalRate = rateTracker.getTotalRate();
    const bufferAllocations: Record<string, number> = {};

    if (totalRate > 0) {
      for (const streamId of input.streams) {
        const rate = rateTracker.getRate(streamId);
        bufferAllocations[streamId] = Math.floor((rate / totalRate) * totalBuffer);
      }
    } else {
      // Equal allocation if no rate data
      const bufferPerStream = Math.floor(totalBuffer / input.streams.length);
      for (const streamId of input.streams) {
        bufferAllocations[streamId] = bufferPerStream;
      }
    }

    // Order by rate (highest first for sequential, shuffle for interleave)
    let streamOrder: string[];

    if (input.mergeStrategy === 'sequential') {
      streamOrder = [...input.streams].sort((a, b) => {
        return rateTracker.getRate(b) - rateTracker.getRate(a);
      });
    } else {
      streamOrder = [...input.streams];
    }

    return {
      success: true,
      data: {
        multiplexId,
        streamOrder,
        bufferAllocations,
      },
      metadata: {
        strategy: 'adaptive',
        totalRate,
      },
    };
  };
}

/**
 * Creates a multiplex handler with maximum stream limit
 */
export function createLimitedMultiplex(
  maxStreams: number,
  innerHandler?: HookHandler<StreamMultiplexInput, StreamMultiplexOutput>
): HookHandler<StreamMultiplexInput, StreamMultiplexOutput> {
  return async (input, context): Promise<HookResult<StreamMultiplexOutput>> => {
    if (input.streams.length > maxStreams) {
      return {
        success: false,
        error: new Error(`Maximum streams (${maxStreams}) exceeded. Requested: ${input.streams.length}`),
        recoverable: false,
      };
    }

    const handler = innerHandler ?? defaultStreamMultiplexHandler;
    return handler(input, context);
  };
}

/**
 * Creates a multiplex handler with logging
 */
export function createLoggingMultiplex(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<StreamMultiplexInput, StreamMultiplexOutput>
): HookHandler<StreamMultiplexInput, StreamMultiplexOutput> {
  return async (input, context): Promise<HookResult<StreamMultiplexOutput>> => {
    logger.info(`Multiplexing ${input.streams.length} streams`, {
      streamCount: input.streams.length,
      strategy: input.mergeStrategy,
      streams: input.streams,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultStreamMultiplexHandler;
    const result = await handler(input, context);

    if (result.success) {
      logger.info(`Multiplex created: ${result.data.multiplexId}`, {
        multiplexId: result.data.multiplexId,
        streamOrder: result.data.streamOrder,
        bufferAllocations: result.data.bufferAllocations,
      });
    }

    return result;
  };
}

/**
 * Register the default stream multiplex hook
 */
export function registerDefaultStreamMultiplex(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.STREAM_MULTIPLEX,
    {
      id: 'default-stream-multiplex',
      name: 'Default Stream Multiplex',
      priority: 'normal',
      description: 'Basic stream multiplexing handler',
    },
    defaultStreamMultiplexHandler
  );
}

/**
 * Stream Complete Hook (#31)
 *
 * Finalizes streaming sessions.
 * Use cases: metrics calculation, cleanup, completion callbacks.
 */

import type {
  HookHandler,
  HookResult,
  StreamCompleteInput,
  StreamCompleteOutput,
  StreamMetrics,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default stream complete handler
 */
export const defaultStreamCompleteHandler: HookHandler<
  StreamCompleteInput,
  StreamCompleteOutput
> = async (input, _context): Promise<HookResult<StreamCompleteOutput>> => {
  const metrics: StreamMetrics = {
    totalTokens: input.totalTokens,
    totalChunks: input.totalChunks,
    duration: input.duration,
    averageChunkSize: input.totalChunks > 0
      ? Math.round(input.totalTokens / input.totalChunks)
      : 0,
    throughput: input.duration > 0
      ? Math.round((input.totalTokens / input.duration) * 1000)
      : 0,
  };

  return {
    success: true,
    data: {
      completed: true,
      finalMetrics: metrics,
    },
  };
};

/**
 * Stream metrics aggregator
 */
export interface StreamMetricsAggregator {
  metrics: Map<string, StreamMetrics>;
  record: (streamId: string, metrics: StreamMetrics) => void;
  get: (streamId: string) => StreamMetrics | undefined;
  getAggregate: () => {
    totalStreams: number;
    totalTokens: number;
    totalDuration: number;
    avgTokensPerStream: number;
    avgThroughput: number;
  };
  clear: () => void;
}

/**
 * Creates a stream metrics aggregator
 */
export function createStreamMetricsAggregator(): StreamMetricsAggregator {
  const metrics = new Map<string, StreamMetrics>();

  return {
    metrics,
    record: (streamId, streamMetrics) => {
      metrics.set(streamId, streamMetrics);
    },
    get: (streamId) => metrics.get(streamId),
    getAggregate: () => {
      const allMetrics = Array.from(metrics.values());
      const totalStreams = allMetrics.length;

      if (totalStreams === 0) {
        return {
          totalStreams: 0,
          totalTokens: 0,
          totalDuration: 0,
          avgTokensPerStream: 0,
          avgThroughput: 0,
        };
      }

      const totalTokens = allMetrics.reduce((sum, m) => sum + m.totalTokens, 0);
      const totalDuration = allMetrics.reduce((sum, m) => sum + m.duration, 0);
      const avgThroughput = allMetrics.reduce((sum, m) => sum + m.throughput, 0) / totalStreams;

      return {
        totalStreams,
        totalTokens,
        totalDuration,
        avgTokensPerStream: Math.round(totalTokens / totalStreams),
        avgThroughput: Math.round(avgThroughput),
      };
    },
    clear: () => metrics.clear(),
  };
}

/**
 * Creates a stream complete handler with metrics recording
 */
export function createMetricsRecordingComplete(
  aggregator: StreamMetricsAggregator
): HookHandler<StreamCompleteInput, StreamCompleteOutput> {
  return async (input, _context): Promise<HookResult<StreamCompleteOutput>> => {
    const metrics: StreamMetrics = {
      totalTokens: input.totalTokens,
      totalChunks: input.totalChunks,
      duration: input.duration,
      averageChunkSize: input.totalChunks > 0
        ? Math.round(input.totalTokens / input.totalChunks)
        : 0,
      throughput: input.duration > 0
        ? Math.round((input.totalTokens / input.duration) * 1000)
        : 0,
    };

    aggregator.record(input.streamId, metrics);

    return {
      success: true,
      data: {
        completed: true,
        finalMetrics: metrics,
      },
      metadata: {
        aggregate: aggregator.getAggregate(),
      },
    };
  };
}

/**
 * Creates a stream complete handler with cleanup
 */
export function createCleanupComplete(
  cleanupHandlers: Array<{
    name: string;
    cleanup: (streamId: string) => Promise<void>;
  }>
): HookHandler<StreamCompleteInput, StreamCompleteOutput> {
  return async (input, _context): Promise<HookResult<StreamCompleteOutput>> => {
    const metrics: StreamMetrics = {
      totalTokens: input.totalTokens,
      totalChunks: input.totalChunks,
      duration: input.duration,
      averageChunkSize: input.totalChunks > 0
        ? Math.round(input.totalTokens / input.totalChunks)
        : 0,
      throughput: input.duration > 0
        ? Math.round((input.totalTokens / input.duration) * 1000)
        : 0,
    };

    // Run cleanup handlers
    const cleanupResults: Record<string, boolean> = {};

    for (const { name, cleanup } of cleanupHandlers) {
      try {
        await cleanup(input.streamId);
        cleanupResults[name] = true;
      } catch {
        cleanupResults[name] = false;
      }
    }

    return {
      success: true,
      data: {
        completed: true,
        finalMetrics: metrics,
      },
      metadata: {
        cleanupResults,
      },
    };
  };
}

/**
 * Creates a stream complete handler with callbacks
 */
export function createCallbackComplete(
  onComplete: (streamId: string, metrics: StreamMetrics) => void
): HookHandler<StreamCompleteInput, StreamCompleteOutput> {
  return async (input, _context): Promise<HookResult<StreamCompleteOutput>> => {
    const metrics: StreamMetrics = {
      totalTokens: input.totalTokens,
      totalChunks: input.totalChunks,
      duration: input.duration,
      averageChunkSize: input.totalChunks > 0
        ? Math.round(input.totalTokens / input.totalChunks)
        : 0,
      throughput: input.duration > 0
        ? Math.round((input.totalTokens / input.duration) * 1000)
        : 0,
    };

    onComplete(input.streamId, metrics);

    return {
      success: true,
      data: {
        completed: true,
        finalMetrics: metrics,
      },
    };
  };
}

/**
 * Creates a stream complete handler with logging
 */
export function createLoggingComplete(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<StreamCompleteInput, StreamCompleteOutput>
): HookHandler<StreamCompleteInput, StreamCompleteOutput> {
  return async (input, context): Promise<HookResult<StreamCompleteOutput>> => {
    const handler = innerHandler ?? defaultStreamCompleteHandler;
    const result = await handler(input, context);

    if (result.success) {
      logger.info(`Stream completed: ${input.streamId}`, {
        streamId: input.streamId,
        totalChunks: input.totalChunks,
        totalTokens: input.totalTokens,
        duration: input.duration,
        throughput: result.data.finalMetrics.throughput,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default stream complete hook
 */
export function registerDefaultStreamComplete(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.STREAM_COMPLETE,
    {
      id: 'default-stream-complete',
      name: 'Default Stream Complete',
      priority: 'normal',
      description: 'Basic stream completion handler',
    },
    defaultStreamCompleteHandler
  );
}

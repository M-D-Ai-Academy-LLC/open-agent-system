/**
 * Stream Start Hook (#29)
 *
 * Initializes streaming sessions.
 * Use cases: buffer allocation, stream tracking, resource setup.
 */

import type {
  HookHandler,
  HookResult,
  StreamStartInput,
  StreamStartOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default stream start handler
 */
export const defaultStreamStartHandler: HookHandler<
  StreamStartInput,
  StreamStartOutput
> = async (input, _context): Promise<HookResult<StreamStartOutput>> => {
  const streamId = `stream-${input.requestId}-${Date.now()}`;

  return {
    success: true,
    data: {
      streamId,
      started: true,
      bufferSize: 4096,
    },
  };
};

/**
 * Stream registry for tracking active streams
 */
export interface StreamRegistry {
  streams: Map<string, {
    requestId: string;
    model: string;
    startTime: number;
    bufferSize: number;
    estimatedTokens?: number;
    chunksReceived: number;
    tokensReceived: number;
    status: 'starting' | 'active' | 'completing' | 'completed' | 'error';
  }>;
  register: (streamId: string, input: StreamStartInput, bufferSize: number) => void;
  get: (streamId: string) => StreamStartInput & { bufferSize: number } | undefined;
  updateChunks: (streamId: string, chunks: number, tokens: number) => void;
  setStatus: (streamId: string, status: 'starting' | 'active' | 'completing' | 'completed' | 'error') => void;
  complete: (streamId: string) => number;
  getActive: () => string[];
}

/**
 * Creates a stream registry
 */
export function createStreamRegistry(): StreamRegistry {
  const streams = new Map<string, {
    requestId: string;
    model: string;
    startTime: number;
    bufferSize: number;
    estimatedTokens?: number;
    chunksReceived: number;
    tokensReceived: number;
    status: 'starting' | 'active' | 'completing' | 'completed' | 'error';
  }>();

  return {
    streams,
    register: (streamId, input, bufferSize) => {
      streams.set(streamId, {
        requestId: input.requestId,
        model: input.model,
        startTime: Date.now(),
        bufferSize,
        estimatedTokens: input.estimatedTokens,
        chunksReceived: 0,
        tokensReceived: 0,
        status: 'starting',
      });
    },
    get: (streamId) => {
      const stream = streams.get(streamId);
      if (!stream) return undefined;
      return {
        requestId: stream.requestId,
        model: stream.model,
        estimatedTokens: stream.estimatedTokens,
        bufferSize: stream.bufferSize,
      };
    },
    updateChunks: (streamId, chunks, tokens) => {
      const stream = streams.get(streamId);
      if (stream) {
        stream.chunksReceived = chunks;
        stream.tokensReceived = tokens;
        if (stream.status === 'starting') {
          stream.status = 'active';
        }
      }
    },
    setStatus: (streamId, status) => {
      const stream = streams.get(streamId);
      if (stream) {
        stream.status = status;
      }
    },
    complete: (streamId) => {
      const stream = streams.get(streamId);
      if (!stream) return 0;
      const duration = Date.now() - stream.startTime;
      stream.status = 'completed';
      return duration;
    },
    getActive: () => {
      return Array.from(streams.entries())
        .filter(([_, s]) => s.status === 'active' || s.status === 'starting')
        .map(([id]) => id);
    },
  };
}

/**
 * Creates a stream start handler with dynamic buffer sizing
 */
export function createDynamicBufferStart(
  modelBufferSizes: Map<string, number>,
  defaultBufferSize: number = 4096
): HookHandler<StreamStartInput, StreamStartOutput> {
  return async (input, _context): Promise<HookResult<StreamStartOutput>> => {
    const streamId = `stream-${input.requestId}-${Date.now()}`;

    // Determine buffer size based on model
    let bufferSize = modelBufferSizes.get(input.model) ?? defaultBufferSize;

    // Scale buffer based on estimated tokens
    if (input.estimatedTokens) {
      if (input.estimatedTokens > 10000) {
        bufferSize = Math.min(bufferSize * 4, 65536);
      } else if (input.estimatedTokens > 1000) {
        bufferSize = Math.min(bufferSize * 2, 32768);
      }
    }

    return {
      success: true,
      data: {
        streamId,
        started: true,
        bufferSize,
      },
    };
  };
}

/**
 * Creates a stream start handler with rate limiting
 */
export function createRateLimitedStart(
  maxConcurrentStreams: number,
  activeStreamTracker: {
    getCount: () => number;
    increment: () => void;
  }
): HookHandler<StreamStartInput, StreamStartOutput> {
  return async (input, _context): Promise<HookResult<StreamStartOutput>> => {
    if (activeStreamTracker.getCount() >= maxConcurrentStreams) {
      return {
        success: false,
        error: new Error(`Maximum concurrent streams (${maxConcurrentStreams}) reached`),
        recoverable: true,
      };
    }

    activeStreamTracker.increment();
    const streamId = `stream-${input.requestId}-${Date.now()}`;

    return {
      success: true,
      data: {
        streamId,
        started: true,
        bufferSize: 4096,
      },
      metadata: {
        currentStreamCount: activeStreamTracker.getCount(),
      },
    };
  };
}

/**
 * Creates a stream start handler with logging
 */
export function createLoggingStart(
  logger: {
    info: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<StreamStartInput, StreamStartOutput>
): HookHandler<StreamStartInput, StreamStartOutput> {
  return async (input, context): Promise<HookResult<StreamStartOutput>> => {
    logger.info(`Starting stream for request: ${input.requestId}`, {
      requestId: input.requestId,
      model: input.model,
      estimatedTokens: input.estimatedTokens,
    });

    const handler = innerHandler ?? defaultStreamStartHandler;
    const result = await handler(input, context);

    if (result.success) {
      logger.info(`Stream started: ${result.data.streamId}`, {
        streamId: result.data.streamId,
        bufferSize: result.data.bufferSize,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default stream start hook
 */
export function registerDefaultStreamStart(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.STREAM_START,
    {
      id: 'default-stream-start',
      name: 'Default Stream Start',
      priority: 'normal',
      description: 'Basic stream initialization handler',
    },
    defaultStreamStartHandler
  );
}

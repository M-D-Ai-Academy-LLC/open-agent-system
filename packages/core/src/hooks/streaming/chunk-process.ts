/**
 * Chunk Process Hook (#30)
 *
 * Processes individual stream chunks.
 * Use cases: content transformation, filtering, accumulation.
 */

import type {
  HookHandler,
  HookResult,
  ChunkProcessInput,
  ChunkProcessOutput,
  StreamChunk,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default chunk process handler - pass through
 */
export const defaultChunkProcessHandler: HookHandler<
  ChunkProcessInput,
  ChunkProcessOutput
> = async (input, _context): Promise<HookResult<ChunkProcessOutput>> => {
  return {
    success: true,
    data: {
      processed: true,
      transformedChunk: input.chunk,
    },
  };
};

/**
 * Chunk accumulator for building complete content
 */
export interface ChunkAccumulator {
  accumulators: Map<string, {
    chunks: StreamChunk[];
    content: string;
    tokenCount: number;
    lastChunkTime: number;
  }>;
  accumulate: (streamId: string, chunk: StreamChunk) => string;
  getContent: (streamId: string) => string;
  getTokenCount: (streamId: string) => number;
  clear: (streamId: string) => void;
}

/**
 * Creates a chunk accumulator
 */
export function createChunkAccumulator(): ChunkAccumulator {
  const accumulators = new Map<string, {
    chunks: StreamChunk[];
    content: string;
    tokenCount: number;
    lastChunkTime: number;
  }>();

  const getOrCreate = (streamId: string) => {
    let acc = accumulators.get(streamId);
    if (!acc) {
      acc = {
        chunks: [],
        content: '',
        tokenCount: 0,
        lastChunkTime: Date.now(),
      };
      accumulators.set(streamId, acc);
    }
    return acc;
  };

  return {
    accumulators,
    accumulate: (streamId, chunk) => {
      const acc = getOrCreate(streamId);
      acc.chunks.push(chunk);
      acc.content += chunk.content;
      acc.tokenCount += chunk.tokenCount ?? 0;
      acc.lastChunkTime = Date.now();
      return acc.content;
    },
    getContent: (streamId) => accumulators.get(streamId)?.content ?? '',
    getTokenCount: (streamId) => accumulators.get(streamId)?.tokenCount ?? 0,
    clear: (streamId) => accumulators.delete(streamId),
  };
}

/**
 * Creates a chunk process handler with content transformation
 */
export function createTransformingChunkProcess(
  transformers: Array<{
    name: string;
    transform: (content: string) => string;
  }>
): HookHandler<ChunkProcessInput, ChunkProcessOutput> {
  return async (input, _context): Promise<HookResult<ChunkProcessOutput>> => {
    let content = input.chunk.content;

    for (const { transform } of transformers) {
      content = transform(content);
    }

    const transformedChunk: StreamChunk = {
      ...input.chunk,
      content,
    };

    return {
      success: true,
      data: {
        processed: true,
        transformedChunk,
        metadata: {
          transformersApplied: transformers.map((t) => t.name),
        },
      },
    };
  };
}

/**
 * Creates a chunk process handler with content filtering
 */
export function createFilteringChunkProcess(
  filters: Array<{
    pattern: RegExp;
    replacement: string;
  }>
): HookHandler<ChunkProcessInput, ChunkProcessOutput> {
  return async (input, _context): Promise<HookResult<ChunkProcessOutput>> => {
    let content = input.chunk.content;
    let filtered = false;

    for (const { pattern, replacement } of filters) {
      if (pattern.test(content)) {
        content = content.replace(pattern, replacement);
        filtered = true;
      }
    }

    const transformedChunk: StreamChunk = {
      ...input.chunk,
      content,
    };

    return {
      success: true,
      data: {
        processed: true,
        transformedChunk,
        metadata: {
          filtered,
        },
      },
    };
  };
}

/**
 * Creates a chunk process handler with debouncing
 */
export function createDebouncedChunkProcess(
  debounceMs: number = 50,
  innerHandler?: HookHandler<ChunkProcessInput, ChunkProcessOutput>
): HookHandler<ChunkProcessInput, ChunkProcessOutput> {
  const pendingChunks = new Map<string, {
    chunks: ChunkProcessInput[];
    timer: NodeJS.Timeout;
  }>();

  return async (input, context): Promise<HookResult<ChunkProcessOutput>> => {
    const handler = innerHandler ?? defaultChunkProcessHandler;

    // If this is the last chunk, process immediately
    if (input.chunk.isLast) {
      return handler(input, context);
    }

    // Accumulate chunks within debounce window
    const pending = pendingChunks.get(input.streamId);

    if (pending) {
      pending.chunks.push(input);
      clearTimeout(pending.timer);

      const timer = setTimeout(() => {
        pendingChunks.delete(input.streamId);
      }, debounceMs);

      pending.timer = timer;

      return {
        success: true,
        data: {
          processed: true,
          metadata: {
            debounced: true,
            bufferedChunks: pending.chunks.length,
          },
        },
      };
    }

    // First chunk in window - start debounce timer
    const timer = setTimeout(() => {
      pendingChunks.delete(input.streamId);
    }, debounceMs);

    pendingChunks.set(input.streamId, {
      chunks: [input],
      timer,
    });

    return handler(input, context);
  };
}

/**
 * Creates a chunk process handler with progress tracking
 */
export function createProgressTrackingChunkProcess(
  onProgress: (streamId: string, progress: { chunkIndex: number; totalChunks?: number; percentage?: number }) => void
): HookHandler<ChunkProcessInput, ChunkProcessOutput> {
  return async (input, _context): Promise<HookResult<ChunkProcessOutput>> => {
    const percentage = input.totalChunks
      ? Math.round((input.chunkIndex / input.totalChunks) * 100)
      : undefined;

    onProgress(input.streamId, {
      chunkIndex: input.chunkIndex,
      totalChunks: input.totalChunks,
      percentage,
    });

    return {
      success: true,
      data: {
        processed: true,
        transformedChunk: input.chunk,
        metadata: {
          progress: percentage,
        },
      },
    };
  };
}

/**
 * Creates a chunk process handler with logging
 */
export function createLoggingChunkProcess(
  logger: {
    debug: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<ChunkProcessInput, ChunkProcessOutput>
): HookHandler<ChunkProcessInput, ChunkProcessOutput> {
  return async (input, context): Promise<HookResult<ChunkProcessOutput>> => {
    logger.debug(`Processing chunk ${input.chunkIndex} for stream ${input.streamId}`, {
      streamId: input.streamId,
      chunkIndex: input.chunkIndex,
      totalChunks: input.totalChunks,
      chunkId: input.chunk.id,
      isFirst: input.chunk.isFirst,
      isLast: input.chunk.isLast,
      contentLength: input.chunk.content.length,
    });

    const handler = innerHandler ?? defaultChunkProcessHandler;
    return handler(input, context);
  };
}

/**
 * Creates a composite chunk process handler
 */
export function createCompositeChunkProcess(
  handlers: HookHandler<ChunkProcessInput, ChunkProcessOutput>[]
): HookHandler<ChunkProcessInput, ChunkProcessOutput> {
  return async (input, context): Promise<HookResult<ChunkProcessOutput>> => {
    let currentChunk = input.chunk;

    for (const handler of handlers) {
      const result = await handler({ ...input, chunk: currentChunk }, context);

      if (!result.success) {
        return result;
      }

      if (result.data.transformedChunk) {
        currentChunk = result.data.transformedChunk;
      }
    }

    return {
      success: true,
      data: {
        processed: true,
        transformedChunk: currentChunk,
      },
    };
  };
}

/**
 * Register the default chunk process hook
 */
export function registerDefaultChunkProcess(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.CHUNK_PROCESS,
    {
      id: 'default-chunk-process',
      name: 'Default Chunk Process',
      priority: 'normal',
      description: 'Basic chunk processing handler',
    },
    defaultChunkProcessHandler
  );
}

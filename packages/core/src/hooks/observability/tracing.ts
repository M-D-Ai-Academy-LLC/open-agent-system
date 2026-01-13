/**
 * Trace Start Hook (#37)
 *
 * Starts distributed traces for observability.
 * Use cases: request tracing, performance analysis, debugging.
 */

import type {
  HookHandler,
  HookResult,
  TraceStartInput,
  TraceStartOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Generate a random trace ID
 */
function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a random span ID
 */
function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Default trace start handler
 */
export const defaultTraceStartHandler: HookHandler<
  TraceStartInput,
  TraceStartOutput
> = async (_input, _context): Promise<HookResult<TraceStartOutput>> => {
  return {
    success: true,
    data: {
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      sampled: true,
    },
  };
};

/**
 * Span information stored in the tracer
 */
export interface SpanInfo {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, unknown>;
  }>;
  status: 'unset' | 'ok' | 'error';
  statusMessage?: string;
}

/**
 * Tracer interface for managing traces
 */
export interface Tracer {
  traces: Map<string, SpanInfo[]>;
  activeSpans: Map<string, SpanInfo>;
  startSpan: (traceId: string, operationName: string, parentSpanId?: string, attributes?: Record<string, unknown>) => SpanInfo;
  endSpan: (spanId: string, status?: 'ok' | 'error', statusMessage?: string) => void;
  getSpan: (spanId: string) => SpanInfo | undefined;
  getTrace: (traceId: string) => SpanInfo[];
  addEvent: (spanId: string, name: string, attributes?: Record<string, unknown>) => void;
  setAttribute: (spanId: string, key: string, value: unknown) => void;
}

/**
 * Creates a tracer
 */
export function createTracer(): Tracer {
  const traces = new Map<string, SpanInfo[]>();
  const activeSpans = new Map<string, SpanInfo>();

  return {
    traces,
    activeSpans,
    startSpan: (traceId, operationName, parentSpanId, attributes = {}) => {
      const spanId = generateSpanId();
      const span: SpanInfo = {
        spanId,
        traceId,
        parentSpanId,
        operationName,
        startTime: Date.now(),
        attributes,
        events: [],
        status: 'unset',
      };

      activeSpans.set(spanId, span);

      if (!traces.has(traceId)) {
        traces.set(traceId, []);
      }
      traces.get(traceId)!.push(span);

      return span;
    },
    endSpan: (spanId, status = 'ok', statusMessage) => {
      const span = activeSpans.get(spanId);
      if (span) {
        span.endTime = Date.now();
        span.status = status;
        span.statusMessage = statusMessage;
        activeSpans.delete(spanId);
      }
    },
    getSpan: (spanId) => activeSpans.get(spanId),
    getTrace: (traceId) => traces.get(traceId) ?? [],
    addEvent: (spanId, name, attributes) => {
      const span = activeSpans.get(spanId);
      if (span) {
        span.events.push({
          name,
          timestamp: Date.now(),
          attributes,
        });
      }
    },
    setAttribute: (spanId, key, value) => {
      const span = activeSpans.get(spanId);
      if (span) {
        span.attributes[key] = value;
      }
    },
  };
}

/**
 * Sampling strategy type
 */
export type SamplingStrategy = 'always' | 'never' | 'rate' | 'parent' | 'adaptive';

/**
 * Sampling configuration
 */
export interface SamplingConfig {
  strategy: SamplingStrategy;
  rate?: number; // 0-1 for rate-based sampling
  minSamplesPerWindow?: number; // For adaptive sampling
  windowMs?: number; // For adaptive sampling
}

/**
 * Creates a trace handler with a tracer
 */
export function createTracedHandler(
  tracer: Tracer
): HookHandler<TraceStartInput, TraceStartOutput> {
  return async (input, _context): Promise<HookResult<TraceStartOutput>> => {
    const traceId = generateTraceId();
    const span = tracer.startSpan(
      traceId,
      input.operationName,
      input.parentSpanId,
      input.attributes
    );

    return {
      success: true,
      data: {
        traceId,
        spanId: span.spanId,
        sampled: true,
      },
    };
  };
}

/**
 * Creates a trace handler with sampling
 */
export function createSampledTraceHandler(
  config: SamplingConfig
): HookHandler<TraceStartInput, TraceStartOutput> {
  let sampleCount = 0;
  let windowStart = Date.now();

  return async (_input, context): Promise<HookResult<TraceStartOutput>> => {
    let sampled = false;

    switch (config.strategy) {
      case 'always':
        sampled = true;
        break;

      case 'never':
        sampled = false;
        break;

      case 'rate':
        sampled = Math.random() < (config.rate ?? 0.1);
        break;

      case 'parent':
        // Sample if parent is sampled (check context)
        sampled = context.traceId !== undefined;
        break;

      case 'adaptive': {
        const now = Date.now();
        const windowMs = config.windowMs ?? 60000;
        const minSamples = config.minSamplesPerWindow ?? 10;

        // Reset window if expired
        if (now - windowStart > windowMs) {
          sampleCount = 0;
          windowStart = now;
        }

        // Always sample if under minimum
        if (sampleCount < minSamples) {
          sampled = true;
          sampleCount++;
        } else {
          // Use rate-based sampling for the rest
          sampled = Math.random() < (config.rate ?? 0.1);
          if (sampled) sampleCount++;
        }
        break;
      }
    }

    if (!sampled) {
      return {
        success: true,
        data: {
          traceId: '',
          spanId: '',
          sampled: false,
        },
      };
    }

    const traceId = generateTraceId();
    const spanId = generateSpanId();

    return {
      success: true,
      data: {
        traceId,
        spanId,
        sampled: true,
      },
      metadata: {
        strategy: config.strategy,
      },
    };
  };
}

/**
 * Creates a trace handler with context propagation
 */
export function createPropagatingTraceHandler(
  tracer: Tracer
): HookHandler<TraceStartInput, TraceStartOutput> {
  return async (input, context): Promise<HookResult<TraceStartOutput>> => {
    // Use existing trace if available in context
    const traceId = context.traceId ?? generateTraceId();
    const parentSpanId = input.parentSpanId ?? context.spanId;

    const span = tracer.startSpan(
      traceId,
      input.operationName,
      parentSpanId,
      {
        ...input.attributes,
        'trace.propagated': context.traceId !== undefined,
      }
    );

    return {
      success: true,
      data: {
        traceId,
        spanId: span.spanId,
        sampled: true,
      },
      metadata: {
        propagated: context.traceId !== undefined,
        parentSpanId,
      },
    };
  };
}

/**
 * Creates a trace handler with W3C trace context support
 */
export function createW3CTraceHandler(): HookHandler<TraceStartInput, TraceStartOutput> {
  return async (input, context): Promise<HookResult<TraceStartOutput>> => {
    // Parse W3C traceparent header if provided
    const traceparent = context.metadata['traceparent'] as string | undefined;

    let traceId: string;
    let parentSpanId: string | undefined;
    let sampled = true;

    if (traceparent) {
      const parts = traceparent.split('-');
      if (parts.length === 4) {
        // version-traceId-parentId-flags
        traceId = parts[1] ?? generateTraceId();
        parentSpanId = parts[2];
        sampled = (parseInt(parts[3] ?? '01', 16) & 0x01) === 1;
      } else {
        traceId = generateTraceId();
      }
    } else {
      traceId = generateTraceId();
    }

    const spanId = generateSpanId();

    return {
      success: true,
      data: {
        traceId,
        spanId,
        sampled,
      },
      metadata: {
        traceparent: `00-${traceId}-${spanId}-${sampled ? '01' : '00'}`,
        tracestate: input.attributes?.['tracestate'] ?? '',
        parentSpanId,
      },
    };
  };
}

/**
 * Creates a trace exporter
 */
export function createTraceExporter(
  exportFn: (spans: SpanInfo[]) => Promise<void>,
  batchSize: number = 100,
  flushInterval: number = 5000
): {
  export: (span: SpanInfo) => void;
  flush: () => Promise<void>;
  stop: () => void;
} {
  const buffer: SpanInfo[] = [];
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const flush = async () => {
    if (buffer.length === 0) return;
    const toExport = buffer.splice(0, buffer.length);
    await exportFn(toExport);
  };

  intervalId = setInterval(flush, flushInterval);

  return {
    export: (span) => {
      buffer.push(span);
      if (buffer.length >= batchSize) {
        flush();
      }
    },
    flush,
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    },
  };
}

/**
 * Creates a logging trace handler
 */
export function createLoggingTraceHandler(
  logger: {
    debug: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<TraceStartInput, TraceStartOutput>
): HookHandler<TraceStartInput, TraceStartOutput> {
  return async (input, context): Promise<HookResult<TraceStartOutput>> => {
    logger.debug(`Starting trace: ${input.operationName}`, {
      operationName: input.operationName,
      parentSpanId: input.parentSpanId,
      attributes: input.attributes,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultTraceStartHandler;
    const result = await handler(input, context);

    if (result.success) {
      logger.debug(`Trace started: ${result.data.traceId}`, {
        traceId: result.data.traceId,
        spanId: result.data.spanId,
        sampled: result.data.sampled,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default trace start hook
 */
export function registerDefaultTraceStart(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.TRACE_START,
    {
      id: 'default-trace-start',
      name: 'Default Trace Start',
      priority: 'high',
      description: 'Basic trace start handler',
    },
    defaultTraceStartHandler
  );
}

/**
 * Span Annotation Hook (#38)
 *
 * Annotates spans with additional metadata.
 * Use cases: debugging, correlation, enrichment.
 */

import type {
  HookHandler,
  HookResult,
  SpanAnnotationInput,
  SpanAnnotationOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';
import type { Tracer } from './tracing.js';

/**
 * Default span annotation handler
 */
export const defaultSpanAnnotationHandler: HookHandler<
  SpanAnnotationInput,
  SpanAnnotationOutput
> = async (_input, _context): Promise<HookResult<SpanAnnotationOutput>> => {
  return {
    success: true,
    data: {
      annotated: true,
    },
  };
};

/**
 * Annotation type
 */
export type AnnotationType = 'attribute' | 'event' | 'link' | 'status';

/**
 * Span annotation definition
 */
export interface SpanAnnotation {
  type: AnnotationType;
  key: string;
  value: unknown;
  timestamp?: number;
}

/**
 * Annotation storage interface
 */
export interface AnnotationStore {
  annotations: Map<string, SpanAnnotation[]>;
  add: (spanId: string, annotation: SpanAnnotation) => void;
  get: (spanId: string) => SpanAnnotation[];
  clear: (spanId: string) => void;
}

/**
 * Creates an annotation store
 */
export function createAnnotationStore(): AnnotationStore {
  const annotations = new Map<string, SpanAnnotation[]>();

  return {
    annotations,
    add: (spanId, annotation) => {
      if (!annotations.has(spanId)) {
        annotations.set(spanId, []);
      }
      annotations.get(spanId)!.push({
        ...annotation,
        timestamp: annotation.timestamp ?? Date.now(),
      });
    },
    get: (spanId) => annotations.get(spanId) ?? [],
    clear: (spanId) => {
      annotations.delete(spanId);
    },
  };
}

/**
 * Creates a span annotation handler with a tracer
 */
export function createTracerAnnotationHandler(
  tracer: Tracer
): HookHandler<SpanAnnotationInput, SpanAnnotationOutput> {
  return async (input, _context): Promise<HookResult<SpanAnnotationOutput>> => {
    const span = tracer.getSpan(input.spanId);

    if (!span) {
      // Try to find in completed spans
      for (const spans of tracer.traces.values()) {
        const found = spans.find((s) => s.spanId === input.spanId);
        if (found) {
          found.attributes[input.key] = input.value;
          return {
            success: true,
            data: {
              annotated: true,
              spanDuration: found.endTime
                ? found.endTime - found.startTime
                : Date.now() - found.startTime,
            },
          };
        }
      }

      return {
        success: false,
        error: new Error(`Span not found: ${input.spanId}`),
        recoverable: false,
      };
    }

    tracer.setAttribute(input.spanId, input.key, input.value);

    return {
      success: true,
      data: {
        annotated: true,
        spanDuration: span.endTime
          ? span.endTime - span.startTime
          : Date.now() - span.startTime,
      },
    };
  };
}

/**
 * Creates a span annotation handler with a store
 */
export function createStoredAnnotationHandler(
  store: AnnotationStore
): HookHandler<SpanAnnotationInput, SpanAnnotationOutput> {
  return async (input, _context): Promise<HookResult<SpanAnnotationOutput>> => {
    store.add(input.spanId, {
      type: 'attribute',
      key: input.key,
      value: input.value,
      timestamp: input.timestamp,
    });

    return {
      success: true,
      data: {
        annotated: true,
      },
      metadata: {
        totalAnnotations: store.get(input.spanId).length,
      },
    };
  };
}

/**
 * Creates a span annotation handler with validation
 */
export function createValidatingAnnotationHandler(
  allowedKeys: string[],
  maxValueSize: number = 1024
): HookHandler<SpanAnnotationInput, SpanAnnotationOutput> {
  return async (input, _context): Promise<HookResult<SpanAnnotationOutput>> => {
    // Validate key
    if (allowedKeys.length > 0 && !allowedKeys.includes(input.key)) {
      return {
        success: false,
        error: new Error(`Invalid annotation key: ${input.key}. Allowed: ${allowedKeys.join(', ')}`),
        recoverable: false,
      };
    }

    // Validate value size
    const valueSize = JSON.stringify(input.value).length;
    if (valueSize > maxValueSize) {
      return {
        success: false,
        error: new Error(`Annotation value too large: ${valueSize} bytes (max: ${maxValueSize})`),
        recoverable: false,
      };
    }

    return {
      success: true,
      data: {
        annotated: true,
      },
      metadata: {
        valueSize,
      },
    };
  };
}

/**
 * Semantic convention keys for common annotations
 */
export const SemanticConventions = {
  // HTTP
  HTTP_METHOD: 'http.method',
  HTTP_URL: 'http.url',
  HTTP_STATUS_CODE: 'http.status_code',
  HTTP_REQUEST_CONTENT_LENGTH: 'http.request_content_length',
  HTTP_RESPONSE_CONTENT_LENGTH: 'http.response_content_length',

  // Database
  DB_SYSTEM: 'db.system',
  DB_NAME: 'db.name',
  DB_OPERATION: 'db.operation',
  DB_STATEMENT: 'db.statement',

  // AI/LLM
  LLM_MODEL: 'llm.model',
  LLM_PROVIDER: 'llm.provider',
  LLM_INPUT_TOKENS: 'llm.input_tokens',
  LLM_OUTPUT_TOKENS: 'llm.output_tokens',
  LLM_TEMPERATURE: 'llm.temperature',

  // Agent
  AGENT_ID: 'agent.id',
  AGENT_NAME: 'agent.name',
  AGENT_STATE: 'agent.state',

  // Tool
  TOOL_NAME: 'tool.name',
  TOOL_DURATION: 'tool.duration',
  TOOL_SUCCESS: 'tool.success',

  // Error
  ERROR_TYPE: 'error.type',
  ERROR_MESSAGE: 'error.message',
  ERROR_STACK: 'error.stack',
} as const;

/**
 * Creates a semantic annotation handler
 */
export function createSemanticAnnotationHandler(
  innerHandler?: HookHandler<SpanAnnotationInput, SpanAnnotationOutput>
): HookHandler<SpanAnnotationInput, SpanAnnotationOutput> {
  return async (input, context): Promise<HookResult<SpanAnnotationOutput>> => {
    // Normalize key to semantic convention if possible
    let normalizedKey = input.key;

    const semanticValues = Object.values(SemanticConventions);
    if (!semanticValues.includes(input.key as typeof semanticValues[number])) {
      // Try to map common patterns
      const keyLower = input.key.toLowerCase();
      if (keyLower.includes('model')) normalizedKey = SemanticConventions.LLM_MODEL;
      else if (keyLower.includes('tokens')) normalizedKey = SemanticConventions.LLM_INPUT_TOKENS;
      else if (keyLower.includes('status')) normalizedKey = SemanticConventions.HTTP_STATUS_CODE;
      else if (keyLower.includes('error')) normalizedKey = SemanticConventions.ERROR_MESSAGE;
    }

    const normalizedInput: SpanAnnotationInput = {
      ...input,
      key: normalizedKey,
    };

    const handler = innerHandler ?? defaultSpanAnnotationHandler;
    return handler(normalizedInput, context);
  };
}

/**
 * Creates a batching annotation handler
 */
export function createBatchingAnnotationHandler(
  batchSize: number = 10,
  flushInterval: number = 1000,
  innerHandler?: HookHandler<SpanAnnotationInput, SpanAnnotationOutput>
): {
  handler: HookHandler<SpanAnnotationInput, SpanAnnotationOutput>;
  flush: () => Promise<void>;
  stop: () => void;
} {
  const buffer: Array<{ input: SpanAnnotationInput; resolve: (result: HookResult<SpanAnnotationOutput>) => void }> = [];
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const processBatch = async () => {
    if (buffer.length === 0) return;

    const batch = buffer.splice(0, buffer.length);
    const handler = innerHandler ?? defaultSpanAnnotationHandler;

    for (const item of batch) {
      const result = await handler(item.input, {
        requestId: `batch-${Date.now()}`,
        timestamp: Date.now(),
        metadata: {},
      });
      item.resolve(result);
    }
  };

  intervalId = setInterval(processBatch, flushInterval);

  const handler: HookHandler<SpanAnnotationInput, SpanAnnotationOutput> = async (
    input,
    _context
  ): Promise<HookResult<SpanAnnotationOutput>> => {
    return new Promise((resolve) => {
      buffer.push({ input, resolve });

      if (buffer.length >= batchSize) {
        processBatch();
      }
    });
  };

  return {
    handler,
    flush: processBatch,
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    },
  };
}

/**
 * Creates a span enrichment handler that auto-annotates
 */
export function createEnrichingAnnotationHandler(
  enrichments: Array<{
    condition: (input: SpanAnnotationInput) => boolean;
    enrich: (input: SpanAnnotationInput) => Record<string, unknown>;
  }>,
  innerHandler?: HookHandler<SpanAnnotationInput, SpanAnnotationOutput>
): HookHandler<SpanAnnotationInput, SpanAnnotationOutput> {
  const store = createAnnotationStore();

  return async (input, context): Promise<HookResult<SpanAnnotationOutput>> => {
    // First, add the original annotation
    store.add(input.spanId, {
      type: 'attribute',
      key: input.key,
      value: input.value,
      timestamp: input.timestamp,
    });

    // Then check for enrichments
    for (const enrichment of enrichments) {
      if (enrichment.condition(input)) {
        const additionalAttrs = enrichment.enrich(input);
        for (const [key, value] of Object.entries(additionalAttrs)) {
          store.add(input.spanId, {
            type: 'attribute',
            key,
            value,
            timestamp: Date.now(),
          });
        }
      }
    }

    const handler = innerHandler ?? defaultSpanAnnotationHandler;
    const result = await handler(input, context);

    if (result.success) {
      return {
        ...result,
        metadata: {
          ...result.metadata,
          totalAnnotations: store.get(input.spanId).length,
        },
      };
    }

    return result;
  };
}

/**
 * Creates a logging annotation handler
 */
export function createLoggingAnnotationHandler(
  logger: {
    debug: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<SpanAnnotationInput, SpanAnnotationOutput>
): HookHandler<SpanAnnotationInput, SpanAnnotationOutput> {
  return async (input, context): Promise<HookResult<SpanAnnotationOutput>> => {
    logger.debug(`Annotating span: ${input.spanId}`, {
      spanId: input.spanId,
      key: input.key,
      value: input.value,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultSpanAnnotationHandler;
    const result = await handler(input, context);

    if (result.success) {
      logger.debug(`Span annotated: ${input.spanId}`, {
        spanId: input.spanId,
        annotated: result.data.annotated,
        spanDuration: result.data.spanDuration,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default span annotation hook
 */
export function registerDefaultSpanAnnotation(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.SPAN_ANNOTATION,
    {
      id: 'default-span-annotation',
      name: 'Default Span Annotation',
      priority: 'normal',
      description: 'Basic span annotation handler',
    },
    defaultSpanAnnotationHandler
  );
}

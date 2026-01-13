/**
 * Log Enrichment Hook (#39)
 *
 * Enriches log entries with additional context.
 * Use cases: structured logging, correlation, debugging.
 */

import type {
  HookHandler,
  HookResult,
  LogEnrichmentInput,
  LogEnrichmentOutput,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default log enrichment handler
 */
export const defaultLogEnrichmentHandler: HookHandler<
  LogEnrichmentInput,
  LogEnrichmentOutput
> = async (input, context): Promise<HookResult<LogEnrichmentOutput>> => {
  return {
    success: true,
    data: {
      enrichedMessage: input.message,
      additionalFields: {
        requestId: context.requestId,
        timestamp: context.timestamp,
        level: input.level,
      },
      shouldLog: true,
    },
  };
};

/**
 * Log level priority for filtering
 */
export const LogLevelPriority: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Log enrichment rule
 */
export interface LogEnrichmentRule {
  name: string;
  condition: (input: LogEnrichmentInput) => boolean;
  enrich: (input: LogEnrichmentInput) => Record<string, unknown>;
}

/**
 * Log filter rule
 */
export interface LogFilterRule {
  name: string;
  condition: (input: LogEnrichmentInput) => boolean;
  action: 'allow' | 'deny' | 'sample';
  sampleRate?: number;
}

/**
 * Creates a log enrichment handler with context
 */
export function createContextEnrichingHandler(
  staticContext: Record<string, unknown>
): HookHandler<LogEnrichmentInput, LogEnrichmentOutput> {
  return async (input, context): Promise<HookResult<LogEnrichmentOutput>> => {
    return {
      success: true,
      data: {
        enrichedMessage: input.message,
        additionalFields: {
          ...staticContext,
          ...input.context,
          requestId: context.requestId,
          traceId: context.traceId,
          spanId: context.spanId,
          timestamp: context.timestamp,
          level: input.level,
        },
        shouldLog: true,
      },
    };
  };
}

/**
 * Creates a log enrichment handler with rules
 */
export function createRuleBasedEnrichmentHandler(
  rules: LogEnrichmentRule[]
): HookHandler<LogEnrichmentInput, LogEnrichmentOutput> {
  return async (input, context): Promise<HookResult<LogEnrichmentOutput>> => {
    const additionalFields: Record<string, unknown> = {
      requestId: context.requestId,
      timestamp: context.timestamp,
      level: input.level,
    };

    for (const rule of rules) {
      if (rule.condition(input)) {
        const enriched = rule.enrich(input);
        Object.assign(additionalFields, enriched);
      }
    }

    return {
      success: true,
      data: {
        enrichedMessage: input.message,
        additionalFields,
        shouldLog: true,
      },
      metadata: {
        rulesApplied: rules.filter((r) => r.condition(input)).map((r) => r.name),
      },
    };
  };
}

/**
 * Creates a log enrichment handler with filtering
 */
export function createFilteringLogHandler(
  minLevel: 'debug' | 'info' | 'warn' | 'error',
  filters?: LogFilterRule[]
): HookHandler<LogEnrichmentInput, LogEnrichmentOutput> {
  return async (input, context): Promise<HookResult<LogEnrichmentOutput>> => {
    // Check minimum level
    const inputPriority = LogLevelPriority[input.level] ?? 0;
    const minPriority = LogLevelPriority[minLevel] ?? 0;

    if (inputPriority < minPriority) {
      return {
        success: true,
        data: {
          enrichedMessage: input.message,
          additionalFields: {},
          shouldLog: false,
        },
        metadata: {
          filtered: true,
          reason: `Level ${input.level} below minimum ${minLevel}`,
        },
      };
    }

    // Apply filters
    if (filters) {
      for (const filter of filters) {
        if (filter.condition(input)) {
          switch (filter.action) {
            case 'deny':
              return {
                success: true,
                data: {
                  enrichedMessage: input.message,
                  additionalFields: {},
                  shouldLog: false,
                },
                metadata: {
                  filtered: true,
                  reason: `Denied by filter: ${filter.name}`,
                },
              };

            case 'sample':
              if (Math.random() > (filter.sampleRate ?? 0.1)) {
                return {
                  success: true,
                  data: {
                    enrichedMessage: input.message,
                    additionalFields: {},
                    shouldLog: false,
                  },
                  metadata: {
                    filtered: true,
                    reason: `Sampled out by filter: ${filter.name}`,
                  },
                };
              }
              break;
          }
        }
      }
    }

    return {
      success: true,
      data: {
        enrichedMessage: input.message,
        additionalFields: {
          requestId: context.requestId,
          timestamp: context.timestamp,
          level: input.level,
        },
        shouldLog: true,
      },
    };
  };
}

/**
 * Creates a log enrichment handler with error extraction
 */
export function createErrorEnrichingHandler(): HookHandler<
  LogEnrichmentInput,
  LogEnrichmentOutput
> {
  return async (input, context): Promise<HookResult<LogEnrichmentOutput>> => {
    const additionalFields: Record<string, unknown> = {
      requestId: context.requestId,
      timestamp: context.timestamp,
      level: input.level,
    };

    // Extract error information from context
    const error = input.context?.['error'];
    if (error instanceof Error) {
      additionalFields['error.name'] = error.name;
      additionalFields['error.message'] = error.message;
      additionalFields['error.stack'] = error.stack;

      // Parse stack trace
      if (error.stack) {
        const stackLines = error.stack.split('\n').slice(1, 5);
        additionalFields['error.frames'] = stackLines.map((line) => {
          const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
          if (match) {
            return {
              function: match[1],
              file: match[2],
              line: parseInt(match[3]!, 10),
              column: parseInt(match[4]!, 10),
            };
          }
          return line.trim();
        });
      }
    }

    return {
      success: true,
      data: {
        enrichedMessage: input.message,
        additionalFields,
        shouldLog: true,
      },
    };
  };
}

/**
 * Creates a log enrichment handler with PII masking
 */
export function createPiiMaskingHandler(
  patterns: Array<{ name: string; regex: RegExp; mask: string }>
): HookHandler<LogEnrichmentInput, LogEnrichmentOutput> {
  return async (input, context): Promise<HookResult<LogEnrichmentOutput>> => {
    let maskedMessage = input.message;
    const maskedFields: string[] = [];

    for (const pattern of patterns) {
      if (pattern.regex.test(maskedMessage)) {
        maskedMessage = maskedMessage.replace(pattern.regex, pattern.mask);
        maskedFields.push(pattern.name);
      }
    }

    return {
      success: true,
      data: {
        enrichedMessage: maskedMessage,
        additionalFields: {
          requestId: context.requestId,
          timestamp: context.timestamp,
          level: input.level,
          ...(maskedFields.length > 0 && { maskedFields }),
        },
        shouldLog: true,
      },
    };
  };
}

/**
 * Default PII patterns for masking
 */
export const DefaultPiiPatterns = [
  {
    name: 'email',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    mask: '[EMAIL]',
  },
  {
    name: 'phone',
    regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    mask: '[PHONE]',
  },
  {
    name: 'ssn',
    regex: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
    mask: '[SSN]',
  },
  {
    name: 'creditCard',
    regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    mask: '[CARD]',
  },
  {
    name: 'ipAddress',
    regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    mask: '[IP]',
  },
];

/**
 * Creates a log enrichment handler with structured formatting
 */
export function createStructuredLogHandler(
  format: 'json' | 'logfmt' | 'pretty'
): HookHandler<LogEnrichmentInput, LogEnrichmentOutput> {
  return async (input, context): Promise<HookResult<LogEnrichmentOutput>> => {
    const fields: Record<string, unknown> = {
      ...input.context,
      requestId: context.requestId,
      timestamp: context.timestamp,
      level: input.level,
    };

    let enrichedMessage: string;

    switch (format) {
      case 'json':
        enrichedMessage = JSON.stringify({
          message: input.message,
          ...fields,
        });
        break;

      case 'logfmt':
        const parts = [`msg="${input.message.replace(/"/g, '\\"')}"`];
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) {
            parts.push(`${key}="${String(value).replace(/"/g, '\\"')}"`);
          }
        }
        enrichedMessage = parts.join(' ');
        break;

      case 'pretty':
      default:
        const timestamp = new Date(context.timestamp).toISOString();
        const level = input.level.toUpperCase().padEnd(5);
        enrichedMessage = `[${timestamp}] ${level} ${input.message}`;
        if (Object.keys(fields).length > 0) {
          enrichedMessage += ` | ${JSON.stringify(fields)}`;
        }
        break;
    }

    return {
      success: true,
      data: {
        enrichedMessage,
        additionalFields: fields,
        shouldLog: true,
      },
      metadata: {
        format,
      },
    };
  };
}

/**
 * Creates a rate-limited log handler
 */
export function createRateLimitedLogHandler(
  ratePerSecond: number,
  innerHandler?: HookHandler<LogEnrichmentInput, LogEnrichmentOutput>
): HookHandler<LogEnrichmentInput, LogEnrichmentOutput> {
  const tokenBucket = {
    tokens: ratePerSecond,
    lastRefill: Date.now(),
  };

  return async (input, context): Promise<HookResult<LogEnrichmentOutput>> => {
    const now = Date.now();
    const elapsed = (now - tokenBucket.lastRefill) / 1000;

    // Refill tokens
    tokenBucket.tokens = Math.min(
      ratePerSecond,
      tokenBucket.tokens + elapsed * ratePerSecond
    );
    tokenBucket.lastRefill = now;

    // Check if we have tokens
    if (tokenBucket.tokens < 1) {
      return {
        success: true,
        data: {
          enrichedMessage: input.message,
          additionalFields: {},
          shouldLog: false,
        },
        metadata: {
          rateLimited: true,
          availableTokens: tokenBucket.tokens,
        },
      };
    }

    tokenBucket.tokens--;

    const handler = innerHandler ?? defaultLogEnrichmentHandler;
    return handler(input, context);
  };
}

/**
 * Creates a deduplicating log handler
 */
export function createDeduplicatingLogHandler(
  windowMs: number = 60000,
  innerHandler?: HookHandler<LogEnrichmentInput, LogEnrichmentOutput>
): HookHandler<LogEnrichmentInput, LogEnrichmentOutput> {
  const seen = new Map<string, { count: number; lastSeen: number }>();

  return async (input, context): Promise<HookResult<LogEnrichmentOutput>> => {
    const now = Date.now();
    const key = `${input.level}:${input.message}`;

    // Clean up old entries
    for (const [k, v] of seen) {
      if (now - v.lastSeen > windowMs) {
        seen.delete(k);
      }
    }

    const existing = seen.get(key);

    if (existing) {
      existing.count++;
      existing.lastSeen = now;

      return {
        success: true,
        data: {
          enrichedMessage: input.message,
          additionalFields: {
            duplicateCount: existing.count,
          },
          shouldLog: false,
        },
        metadata: {
          deduplicated: true,
          duplicateCount: existing.count,
        },
      };
    }

    seen.set(key, { count: 1, lastSeen: now });

    const handler = innerHandler ?? defaultLogEnrichmentHandler;
    return handler(input, context);
  };
}

/**
 * Creates a logging log enrichment handler (meta!)
 */
export function createLoggingEnrichmentHandler(
  logger: {
    debug: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<LogEnrichmentInput, LogEnrichmentOutput>
): HookHandler<LogEnrichmentInput, LogEnrichmentOutput> {
  return async (input, context): Promise<HookResult<LogEnrichmentOutput>> => {
    logger.debug(`Enriching log: ${input.level}`, {
      level: input.level,
      messageLength: input.message.length,
      hasContext: !!input.context,
      requestId: context.requestId,
    });

    const handler = innerHandler ?? defaultLogEnrichmentHandler;
    const result = await handler(input, context);

    if (result.success) {
      logger.debug(`Log enriched: shouldLog=${result.data.shouldLog}`, {
        shouldLog: result.data.shouldLog,
        additionalFieldsCount: Object.keys(result.data.additionalFields).length,
        requestId: context.requestId,
      });
    }

    return result;
  };
}

/**
 * Register the default log enrichment hook
 */
export function registerDefaultLogEnrichment(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.LOG_ENRICHMENT,
    {
      id: 'default-log-enrichment',
      name: 'Default Log Enrichment',
      priority: 'normal',
      description: 'Basic log enrichment handler',
    },
    defaultLogEnrichmentHandler
  );
}

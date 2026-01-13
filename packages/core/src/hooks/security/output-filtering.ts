/**
 * Output Filtering Hook (#44)
 *
 * Filters output content before delivery.
 * Use cases: sensitive data redaction, content policy enforcement, format normalization.
 */

import type {
  HookHandler,
  HookResult,
  OutputFilteringInput,
  OutputFilteringOutput,
  OutputFilter,
  Redaction,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default output filtering handler
 */
export const defaultOutputFilteringHandler: HookHandler<
  OutputFilteringInput,
  OutputFilteringOutput
> = async (input, _context): Promise<HookResult<OutputFilteringOutput>> => {
  return {
    success: true,
    data: {
      filtered: input.content,
      redactions: [],
      blocked: false,
    },
  };
};

/**
 * Apply a single filter to content
 */
function applyFilter(
  content: string,
  filter: OutputFilter
): { result: string; redactions: Redaction[]; blocked: boolean } {
  const redactions: Redaction[] = [];
  let result = content;
  let blocked = false;

  let pattern: RegExp;
  switch (filter.type) {
    case 'regex':
      pattern = new RegExp(filter.pattern, 'gi');
      break;
    case 'keyword':
      pattern = new RegExp(`\\b${escapeRegex(filter.pattern)}\\b`, 'gi');
      break;
    case 'semantic':
      // Semantic matching would require ML - simplified to keyword for now
      pattern = new RegExp(escapeRegex(filter.pattern), 'gi');
      break;
  }

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const original = match[0];
    let redacted: string;

    switch (filter.action) {
      case 'redact':
        redacted = '[REDACTED]';
        break;
      case 'block':
        blocked = true;
        redacted = original;
        break;
      case 'flag':
        redacted = `[FLAGGED:${original}]`;
        break;
      default:
        redacted = original;
    }

    redactions.push({
      original,
      redacted,
      reason: `${filter.type}:${filter.pattern}`,
      start: match.index,
      end: match.index + original.length,
    });
  }

  // Apply redactions
  if (!blocked && filter.action !== 'flag') {
    for (const redaction of redactions.reverse()) {
      result = result.slice(0, redaction.start) + redaction.redacted + result.slice(redaction.end);
    }
  }

  return { result, redactions, blocked };
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Creates an output filtering handler with filters
 */
export function createFilteredOutputHandler(
  defaultFilters: OutputFilter[]
): HookHandler<OutputFilteringInput, OutputFilteringOutput> {
  return async (input, _context): Promise<HookResult<OutputFilteringOutput>> => {
    const filters = [...defaultFilters, ...input.filters];
    let content = input.content;
    const allRedactions: Redaction[] = [];
    let blocked = false;

    for (const filter of filters) {
      const { result, redactions, blocked: filterBlocked } = applyFilter(content, filter);

      if (filterBlocked) {
        blocked = true;
        allRedactions.push(...redactions);
        break;
      }

      content = result;
      allRedactions.push(...redactions);
    }

    return {
      success: true,
      data: {
        filtered: blocked ? input.content : content,
        redactions: allRedactions,
        blocked,
      },
    };
  };
}

/**
 * Creates an output filtering handler with PII redaction
 */
export function createPiiRedactingOutputHandler(): HookHandler<
  OutputFilteringInput,
  OutputFilteringOutput
> {
  const piiFilters: OutputFilter[] = [
    // Email addresses
    { type: 'regex', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', action: 'redact' },
    // Phone numbers (US format)
    { type: 'regex', pattern: '\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b', action: 'redact' },
    // SSN
    { type: 'regex', pattern: '\\b\\d{3}[-]?\\d{2}[-]?\\d{4}\\b', action: 'redact' },
    // Credit card numbers
    { type: 'regex', pattern: '\\b\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}\\b', action: 'redact' },
    // IP addresses
    { type: 'regex', pattern: '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b', action: 'redact' },
  ];

  return async (input, _context): Promise<HookResult<OutputFilteringOutput>> => {
    const filters = [...piiFilters, ...input.filters];
    let content = input.content;
    const allRedactions: Redaction[] = [];

    for (const filter of filters) {
      const { result, redactions } = applyFilter(content, filter);
      content = result;
      allRedactions.push(...redactions);
    }

    return {
      success: true,
      data: {
        filtered: content,
        redactions: allRedactions,
        blocked: false,
      },
      metadata: {
        piiRedactionsCount: allRedactions.filter((r) => r.reason.includes('regex')).length,
      },
    };
  };
}

/**
 * Creates an output filtering handler with keyword blocking
 */
export function createKeywordBlockingOutputHandler(
  blockedKeywords: string[],
  caseSensitive: boolean = false
): HookHandler<OutputFilteringInput, OutputFilteringOutput> {
  return async (input, _context): Promise<HookResult<OutputFilteringOutput>> => {
    const keywordFilters: OutputFilter[] = blockedKeywords.map((kw) => ({
      type: 'keyword' as const,
      pattern: kw,
      action: 'block' as const,
    }));

    const filters = [...keywordFilters, ...input.filters];
    let content = input.content;
    const checkContent = caseSensitive ? content : content.toLowerCase();
    const allRedactions: Redaction[] = [];
    let blocked = false;

    for (const filter of filters) {
      if (filter.type === 'keyword') {
        const keyword = caseSensitive ? filter.pattern : filter.pattern.toLowerCase();
        const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, caseSensitive ? 'g' : 'gi');

        let match;
        while ((match = pattern.exec(checkContent)) !== null) {
          if (filter.action === 'block') {
            blocked = true;
            allRedactions.push({
              original: content.slice(match.index, match.index + match[0].length),
              redacted: match[0],
              reason: `blocked-keyword:${filter.pattern}`,
              start: match.index,
              end: match.index + match[0].length,
            });
            break;
          }
        }
      }

      if (blocked) break;

      const { result, redactions } = applyFilter(content, filter);
      content = result;
      allRedactions.push(...redactions);
    }

    return {
      success: true,
      data: {
        filtered: blocked ? input.content : content,
        redactions: allRedactions,
        blocked,
      },
    };
  };
}

/**
 * Creates an output filtering handler with pattern-based replacement
 */
export function createPatternReplacingOutputHandler(
  replacements: Array<{ pattern: string; replacement: string }>
): HookHandler<OutputFilteringInput, OutputFilteringOutput> {
  return async (input, _context): Promise<HookResult<OutputFilteringOutput>> => {
    let content = input.content;
    const redactions: Redaction[] = [];

    for (const { pattern, replacement } of replacements) {
      const regex = new RegExp(pattern, 'gi');
      let match;

      while ((match = regex.exec(input.content)) !== null) {
        redactions.push({
          original: match[0],
          redacted: replacement,
          reason: `pattern-replacement:${pattern}`,
          start: match.index,
          end: match.index + match[0].length,
        });
      }

      content = content.replace(regex, replacement);
    }

    // Also apply input filters
    for (const filter of input.filters) {
      const { result, redactions: filterRedactions } = applyFilter(content, filter);
      content = result;
      redactions.push(...filterRedactions);
    }

    return {
      success: true,
      data: {
        filtered: content,
        redactions,
        blocked: false,
      },
    };
  };
}

/**
 * Creates an output filtering handler with context-aware filtering
 */
export function createContextAwareOutputHandler(
  contextRules: Array<{
    contextKey: string;
    contextValue: unknown;
    filters: OutputFilter[];
  }>
): HookHandler<OutputFilteringInput, OutputFilteringOutput> {
  return async (input, _context): Promise<HookResult<OutputFilteringOutput>> => {
    // Find applicable rules based on context
    const applicableFilters: OutputFilter[] = [];

    for (const rule of contextRules) {
      if (input.context?.[rule.contextKey] === rule.contextValue) {
        applicableFilters.push(...rule.filters);
      }
    }

    const filters = [...applicableFilters, ...input.filters];
    let content = input.content;
    const allRedactions: Redaction[] = [];
    let blocked = false;

    for (const filter of filters) {
      const { result, redactions, blocked: filterBlocked } = applyFilter(content, filter);

      if (filterBlocked) {
        blocked = true;
        allRedactions.push(...redactions);
        break;
      }

      content = result;
      allRedactions.push(...redactions);
    }

    return {
      success: true,
      data: {
        filtered: blocked ? input.content : content,
        redactions: allRedactions,
        blocked,
      },
      metadata: {
        contextRulesApplied: applicableFilters.length,
      },
    };
  };
}

/**
 * Creates an output filtering handler with caching
 */
export function createCachingOutputHandler(
  cacheSize: number = 1000,
  innerHandler?: HookHandler<OutputFilteringInput, OutputFilteringOutput>
): HookHandler<OutputFilteringInput, OutputFilteringOutput> {
  const cache = new Map<string, { filtered: string; redactions: Redaction[]; blocked: boolean }>();

  return async (input, context): Promise<HookResult<OutputFilteringOutput>> => {
    // Create cache key from content and filters
    const cacheKey = `${input.content}::${JSON.stringify(input.filters)}`;

    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)!;
      return {
        success: true,
        data: cached,
        metadata: { cached: true },
      };
    }

    const handler = innerHandler ?? defaultOutputFilteringHandler;
    const result = await handler(input, context);

    if (result.success) {
      // Manage cache size
      if (cache.size >= cacheSize) {
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
      }

      cache.set(cacheKey, result.data);
    }

    return result;
  };
}

/**
 * Creates a logging output filtering handler
 */
export function createLoggingOutputHandler(
  logger: {
    debug: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<OutputFilteringInput, OutputFilteringOutput>
): HookHandler<OutputFilteringInput, OutputFilteringOutput> {
  return async (input, context): Promise<HookResult<OutputFilteringOutput>> => {
    const handler = innerHandler ?? defaultOutputFilteringHandler;
    const result = await handler(input, context);

    if (result.success) {
      if (result.data.blocked) {
        logger.warn(`Output blocked by filter`, {
          redactionsCount: result.data.redactions.length,
          requestId: context.requestId,
        });
      } else if (result.data.redactions.length > 0) {
        logger.debug(`Output filtered`, {
          redactionsCount: result.data.redactions.length,
          requestId: context.requestId,
        });
      }
    }

    return result;
  };
}

/**
 * Register the default output filtering hook
 */
export function registerDefaultOutputFiltering(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.OUTPUT_FILTERING,
    {
      id: 'default-output-filtering',
      name: 'Default Output Filtering',
      priority: 'high',
      description: 'Basic output filtering handler',
    },
    defaultOutputFilteringHandler
  );
}

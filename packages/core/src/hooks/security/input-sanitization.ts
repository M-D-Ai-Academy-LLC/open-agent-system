/**
 * Input Sanitization Hook (#43)
 *
 * Sanitizes input content before processing.
 * Use cases: XSS prevention, injection protection, content normalization.
 */

import type {
  HookHandler,
  HookResult,
  InputSanitizationInput,
  InputSanitizationOutput,
  SanitizationRule,
  SanitizationModification,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default input sanitization handler
 */
export const defaultInputSanitizationHandler: HookHandler<
  InputSanitizationInput,
  InputSanitizationOutput
> = async (input, _context): Promise<HookResult<InputSanitizationOutput>> => {
  return {
    success: true,
    data: {
      sanitized: input.content,
      modifications: [],
      blocked: false,
    },
  };
};

/**
 * Default sanitization rules
 */
export const DefaultSanitizationRules: SanitizationRule[] = [
  // Control characters (except newlines and tabs)
  {
    pattern: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
    action: 'remove',
  },
  // Null bytes
  {
    pattern: /\x00/g,
    action: 'remove',
  },
  // Unicode direction override characters
  {
    pattern: /[\u202A-\u202E\u2066-\u2069]/g,
    action: 'remove',
  },
];

/**
 * Apply a sanitization rule to content
 */
function applySanitizationRule(
  content: string,
  rule: SanitizationRule
): { result: string; modifications: SanitizationModification[] } {
  const modifications: SanitizationModification[] = [];
  let result = content;

  const pattern = typeof rule.pattern === 'string'
    ? new RegExp(rule.pattern, 'g')
    : rule.pattern;

  let match;
  const regex = new RegExp(pattern.source, pattern.flags);

  while ((match = regex.exec(content)) !== null) {
    const original = match[0];
    let modified: string;

    switch (rule.action) {
      case 'remove':
        modified = '';
        break;
      case 'replace':
        modified = rule.replacement ?? '';
        break;
      case 'block':
        // Don't modify, just record
        modified = original;
        modifications.push({
          original,
          modified,
          rule: typeof rule.pattern === 'string' ? rule.pattern : rule.pattern.source,
          position: match.index,
        });
        return { result: content, modifications };
    }

    modifications.push({
      original,
      modified,
      rule: typeof rule.pattern === 'string' ? rule.pattern : rule.pattern.source,
      position: match.index,
    });
  }

  // Apply modifications
  if (rule.action !== 'block') {
    result = content.replace(pattern, rule.replacement ?? '');
  }

  return { result, modifications };
}

/**
 * Creates an input sanitization handler with rules
 */
export function createRuleBasedSanitizationHandler(
  rules: SanitizationRule[]
): HookHandler<InputSanitizationInput, InputSanitizationOutput> {
  return async (input, _context): Promise<HookResult<InputSanitizationOutput>> => {
    const allRules = [...DefaultSanitizationRules, ...rules, ...(input.rules ?? [])];
    let content = input.content;
    const allModifications: SanitizationModification[] = [];
    let blocked = false;

    for (const rule of allRules) {
      const { result, modifications } = applySanitizationRule(content, rule);

      if (rule.action === 'block' && modifications.length > 0) {
        blocked = true;
        allModifications.push(...modifications);
        break;
      }

      content = result;
      allModifications.push(...modifications);
    }

    return {
      success: true,
      data: {
        sanitized: blocked ? input.content : content,
        modifications: allModifications,
        blocked,
      },
    };
  };
}

/**
 * Creates an input sanitization handler with content-type specific rules
 */
export function createContentTypeSanitizationHandler(
  rulesByType: Partial<Record<InputSanitizationInput['contentType'], SanitizationRule[]>>
): HookHandler<InputSanitizationInput, InputSanitizationOutput> {
  return async (input, _context): Promise<HookResult<InputSanitizationOutput>> => {
    const rules = rulesByType[input.contentType] ?? [];
    const allRules = [...DefaultSanitizationRules, ...rules, ...(input.rules ?? [])];

    let content = input.content;
    const allModifications: SanitizationModification[] = [];
    let blocked = false;

    for (const rule of allRules) {
      const { result, modifications } = applySanitizationRule(content, rule);

      if (rule.action === 'block' && modifications.length > 0) {
        blocked = true;
        allModifications.push(...modifications);
        break;
      }

      content = result;
      allModifications.push(...modifications);
    }

    return {
      success: true,
      data: {
        sanitized: blocked ? input.content : content,
        modifications: allModifications,
        blocked,
      },
      metadata: {
        contentType: input.contentType,
        rulesApplied: allRules.length,
      },
    };
  };
}

/**
 * Creates an HTML sanitization handler
 */
export function createHtmlSanitizationHandler(
  allowedTags: string[] = []
): HookHandler<InputSanitizationInput, InputSanitizationOutput> {
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

  return async (input, _context): Promise<HookResult<InputSanitizationOutput>> => {
    const modifications: SanitizationModification[] = [];
    let content = input.content;

    // Remove or allow tags
    content = content.replace(tagPattern, (match, tagName, offset) => {
      const tag = tagName.toLowerCase();

      if (allowedTags.length > 0 && allowedTags.includes(tag)) {
        return match;
      }

      modifications.push({
        original: match,
        modified: '',
        rule: 'html-tag-removal',
        position: offset,
      });

      return '';
    });

    // Remove dangerous attributes from allowed tags
    if (allowedTags.length > 0) {
      const attrPattern = /\s+(on\w+|javascript:|data:)/gi;
      content = content.replace(attrPattern, (match, _attr, offset) => {
        modifications.push({
          original: match,
          modified: '',
          rule: 'dangerous-attribute-removal',
          position: offset,
        });
        return '';
      });
    }

    return {
      success: true,
      data: {
        sanitized: content,
        modifications,
        blocked: false,
      },
    };
  };
}

/**
 * Creates a SQL injection prevention handler
 */
export function createSqlSanitizationHandler(): HookHandler<
  InputSanitizationInput,
  InputSanitizationOutput
> {
  const sqlPatterns: SanitizationRule[] = [
    // SQL keywords at word boundaries
    { pattern: /\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b/gi, action: 'block' },
    // SQL comments
    { pattern: /(--|\/\*|\*\/|#)/g, action: 'replace', replacement: '' },
    // String concatenation attempts
    { pattern: /['"]\s*\+\s*['"]/g, action: 'block' },
    // Semicolons that could terminate statements
    { pattern: /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP)/gi, action: 'block' },
  ];

  return async (input, _context): Promise<HookResult<InputSanitizationOutput>> => {
    let content = input.content;
    const modifications: SanitizationModification[] = [];
    let blocked = false;

    for (const rule of sqlPatterns) {
      const { result, modifications: mods } = applySanitizationRule(content, rule);

      if (rule.action === 'block' && mods.length > 0) {
        blocked = true;
        modifications.push(...mods);
        break;
      }

      content = result;
      modifications.push(...mods);
    }

    return {
      success: true,
      data: {
        sanitized: blocked ? input.content : content,
        modifications,
        blocked,
      },
      metadata: {
        sqlInjectionBlocked: blocked,
      },
    };
  };
}

/**
 * Creates a whitespace normalization handler
 */
export function createWhitespaceNormalizationHandler(): HookHandler<
  InputSanitizationInput,
  InputSanitizationOutput
> {
  return async (input, _context): Promise<HookResult<InputSanitizationOutput>> => {
    const modifications: SanitizationModification[] = [];
    let content = input.content;

    // Normalize various whitespace characters
    const whitespaceMap: [RegExp, string, string][] = [
      [/\t/g, ' ', 'tab-to-space'],
      [/\r\n/g, '\n', 'crlf-to-lf'],
      [/\r/g, '\n', 'cr-to-lf'],
      [/ {2,}/g, ' ', 'multiple-spaces'],
      [/\n{3,}/g, '\n\n', 'multiple-newlines'],
    ];

    for (const [pattern, replacement, ruleName] of whitespaceMap) {
      let match;
      while ((match = pattern.exec(input.content)) !== null) {
        if (match[0] !== replacement) {
          modifications.push({
            original: match[0],
            modified: replacement,
            rule: ruleName,
            position: match.index,
          });
        }
      }
      content = content.replace(pattern, replacement);
    }

    // Trim leading/trailing whitespace
    const trimmed = content.trim();
    if (trimmed !== content) {
      modifications.push({
        original: content,
        modified: trimmed,
        rule: 'trim',
        position: 0,
      });
      content = trimmed;
    }

    return {
      success: true,
      data: {
        sanitized: content,
        modifications,
        blocked: false,
      },
    };
  };
}

/**
 * Creates a length-limiting sanitization handler
 */
export function createLengthLimitingSanitizationHandler(
  maxLength: number,
  truncationStrategy: 'end' | 'middle' | 'start' = 'end'
): HookHandler<InputSanitizationInput, InputSanitizationOutput> {
  return async (input, _context): Promise<HookResult<InputSanitizationOutput>> => {
    if (input.content.length <= maxLength) {
      return {
        success: true,
        data: {
          sanitized: input.content,
          modifications: [],
          blocked: false,
        },
      };
    }

    let sanitized: string;
    const ellipsis = '...';

    switch (truncationStrategy) {
      case 'start':
        sanitized = ellipsis + input.content.slice(-(maxLength - ellipsis.length));
        break;
      case 'middle': {
        const halfLength = Math.floor((maxLength - ellipsis.length) / 2);
        sanitized = input.content.slice(0, halfLength) + ellipsis + input.content.slice(-halfLength);
        break;
      }
      case 'end':
      default:
        sanitized = input.content.slice(0, maxLength - ellipsis.length) + ellipsis;
        break;
    }

    return {
      success: true,
      data: {
        sanitized,
        modifications: [
          {
            original: input.content,
            modified: sanitized,
            rule: `truncate-${truncationStrategy}`,
            position: 0,
          },
        ],
        blocked: false,
      },
      metadata: {
        originalLength: input.content.length,
        truncatedLength: sanitized.length,
        strategy: truncationStrategy,
      },
    };
  };
}

/**
 * Creates a composite sanitization handler
 */
export function createCompositeSanitizationHandler(
  handlers: HookHandler<InputSanitizationInput, InputSanitizationOutput>[]
): HookHandler<InputSanitizationInput, InputSanitizationOutput> {
  return async (input, context): Promise<HookResult<InputSanitizationOutput>> => {
    let content = input.content;
    const allModifications: SanitizationModification[] = [];

    for (const handler of handlers) {
      const result = await handler({ ...input, content }, context);

      if (!result.success) {
        return result;
      }

      if (result.data.blocked) {
        return result;
      }

      content = result.data.sanitized;
      allModifications.push(...result.data.modifications);
    }

    return {
      success: true,
      data: {
        sanitized: content,
        modifications: allModifications,
        blocked: false,
      },
    };
  };
}

/**
 * Creates a logging sanitization handler
 */
export function createLoggingSanitizationHandler(
  logger: {
    debug: (message: string, context: Record<string, unknown>) => void;
    warn: (message: string, context: Record<string, unknown>) => void;
  },
  innerHandler?: HookHandler<InputSanitizationInput, InputSanitizationOutput>
): HookHandler<InputSanitizationInput, InputSanitizationOutput> {
  return async (input, context): Promise<HookResult<InputSanitizationOutput>> => {
    const handler = innerHandler ?? defaultInputSanitizationHandler;
    const result = await handler(input, context);

    if (result.success) {
      if (result.data.blocked) {
        logger.warn(`Input blocked by sanitization`, {
          contentType: input.contentType,
          modificationsCount: result.data.modifications.length,
          requestId: context.requestId,
        });
      } else if (result.data.modifications.length > 0) {
        logger.debug(`Input sanitized`, {
          contentType: input.contentType,
          modificationsCount: result.data.modifications.length,
          requestId: context.requestId,
        });
      }
    }

    return result;
  };
}

/**
 * Register the default input sanitization hook
 */
export function registerDefaultInputSanitization(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.INPUT_SANITIZATION,
    {
      id: 'default-input-sanitization',
      name: 'Default Input Sanitization',
      priority: 'high',
      description: 'Basic input sanitization handler',
    },
    defaultInputSanitizationHandler
  );
}
